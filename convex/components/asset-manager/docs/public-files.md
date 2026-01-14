# Public Files with CDN

This guide covers serving public files through Cloudflare's CDN for maximum performance and global distribution.

## Overview

For public files (no auth required), the asset-manager provides:

- **Direct CDN URLs**: Files served from Cloudflare's edge network
- **Versioned paths**: Each version has a unique URL for cache invalidation
- **Reactive queries**: UI updates automatically when files change

## Architecture

```
┌─────────────────┐     1. useQuery (reactive)      ┌─────────────────┐
│                 │ ◄────────────────────────────── │                 │
│   React App     │     returns { url, ... }        │     Convex      │
│                 │                                 │                 │
└────────┬────────┘                                 └─────────────────┘
         │
         │ 2. Direct request to CDN URL
         │    https://cdn.example.com/{prefix}/{intentId}/file.mp3
         ▼
┌─────────────────┐
│   Cloudflare    │     Cached at edge
│      CDN        │     Global distribution
└────────┬────────┘
         │
         │ Cache miss only
         ▼
┌─────────────────┐
│       R2        │
│    Storage      │
└─────────────────┘
```

## URL Structure

Public files use this URL pattern:

```
https://cdn.yourdomain.com/{r2KeyPrefix}/{intentId}/{filename}
```

- **r2KeyPrefix**: Optional namespace to share bucket across apps
- **intentId**: Unique ID per upload (ensures cache invalidation on new versions)
- **filename**: Original filename (human-readable URLs)

Example:

```
https://assets.myapp.com/myapp/k57x9m2n4p/background-music.mp3
```

## Implementation

### Step 1: Configure R2 with Public URL

```typescript
// Run once to configure storage backend
await ctx.runMutation(components.assetManager.assetManager.configureStorageBackend, {
  backend: "r2",
  r2PublicUrl: "https://assets.yourdomain.com",
  r2KeyPrefix: "myapp", // Optional
});
```

### Step 2: Query for Public File URL

The component returns the full CDN URL:

```typescript
// convex/publicFiles.ts
import { query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

export const getPublicFile = query({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, { folderPath, basename }) => {
    return await ctx.runQuery(components.assetManager.assetManager.getPublishedFile, {
      folderPath,
      basename,
    });
  },
});

export const listPublicFiles = query({
  args: { folderPath: v.string() },
  handler: async (ctx, { folderPath }) => {
    return await ctx.runQuery(components.assetManager.assetManager.listPublishedFilesInFolder, {
      folderPath,
    });
  },
});
```

### Step 3: Use in React

```tsx
// components/PublicImage.tsx
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function PublicImage({
  folderPath,
  basename,
  alt,
}: {
  folderPath: string;
  basename: string;
  alt: string;
}) {
  const file = useQuery(api.publicFiles.getPublicFile, { folderPath, basename });

  if (!file) return <div>Loading...</div>;

  // URL is the direct CDN URL - no auth needed
  return <img src={file.url} alt={alt} />;
}
```

```tsx
// components/PublicAudioPlayer.tsx
export function PublicAudioPlayer({
  folderPath,
  basename,
}: {
  folderPath: string;
  basename: string;
}) {
  const file = useQuery(api.publicFiles.getPublicFile, { folderPath, basename });

  if (!file) return null;

  return (
    <audio controls>
      <source src={file.url} type={file.contentType} />
    </audio>
  );
}
```

```tsx
// components/FileGallery.tsx
export function FileGallery({ folderPath }: { folderPath: string }) {
  const files = useQuery(api.publicFiles.listPublicFiles, { folderPath });

  if (!files) return <div>Loading...</div>;

  return (
    <div className="gallery">
      {files.map((file) => (
        <div key={file.versionId}>
          {file.contentType?.startsWith("image/") ? (
            <img src={file.url} alt={file.basename} />
          ) : file.contentType?.startsWith("audio/") ? (
            <audio controls src={file.url} />
          ) : (
            <a href={file.url} download>
              {file.basename}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
```

## Reactivity

When a file is updated, the CDN URL changes automatically:

1. **Before update**: Query returns `https://cdn.example.com/app/abc123/song.mp3`
2. **Admin uploads a new version**
3. **After update**: Query returns `https://cdn.example.com/app/def456/song.mp3`
4. **React re-renders** with new URL
5. **Browser fetches** the new version

The old version (`abc123`) stays cached at CDN but is no longer referenced.

## Caching Behavior

### CDN Layer (Cloudflare)

Files at versioned URLs are cached indefinitely:

- URL contains intentId, so content never changes at that URL
- Cloudflare caches at edge locations globally
- Cache-Control: `public, max-age=31536000, immutable`

### Browser Layer

Browsers also cache based on URL:

- New version = new URL = fresh fetch
- Same version = same URL = served from browser cache

### Cache Invalidation

You don't need to manually invalidate caches:

- Each new version gets a new intentId
- New intentId = new URL
- Old cached content is simply never requested again

## Uploading Public Files

```typescript
// convex/uploads.ts
import { mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

// Helper to get R2 config from environment
function getR2Config() {
  return {
    R2_BUCKET: process.env.R2_BUCKET!,
    R2_ENDPOINT: process.env.R2_ENDPOINT!,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
  };
}

export const startUpload = mutation({
  args: { folderPath: v.string(), basename: v.string(), filename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.startUpload, {
      ...args,
      r2Config: getR2Config(),
    });
  },
});

export const finishUpload = mutation({
  args: { intentId: v.string(), size: v.number(), contentType: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.finishUpload, {
      intentId: args.intentId as any,
      size: args.size,
      contentType: args.contentType,
      r2Config: getR2Config(),
    });
  },
});
```

### Frontend Upload

```typescript
// lib/upload.ts
async function uploadPublicFile(file: File, folderPath: string, basename: string) {
  // 1. Start upload - get presigned URL
  const { intentId, uploadUrl, backend } = await convex.mutation(api.uploads.startUpload, {
    folderPath,
    basename,
    filename: file.name,
  });

  // 2. Upload to R2 (use PUT, not POST)
  await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

  // 3. Finish upload - create version record
  const result = await convex.mutation(api.uploads.finishUpload, {
    intentId,
    size: file.size,
    contentType: file.type,
  });

  return result;
}
```

## Performance Tips

### 1. Preload Critical Assets

```tsx
// In your head or early in component tree
function PreloadAssets() {
  const heroImage = useQuery(api.publicFiles.getPublicFile, {
    folderPath: "marketing",
    basename: "hero",
  });

  if (heroImage) {
    return (
      <Head>
        <link rel="preload" href={heroImage.url} as="image" />
      </Head>
    );
  }
  return null;
}
```

### 2. Use Appropriate Image Sizes

Store multiple sizes and serve the right one:

```tsx
function ResponsiveImage({ folderPath, basename }: Props) {
  const thumbnail = useQuery(api.publicFiles.getPublicFile, {
    folderPath,
    basename: `${basename}-thumb`,
  });
  const full = useQuery(api.publicFiles.getPublicFile, {
    folderPath,
    basename: `${basename}-full`,
  });

  const thumbUrl = thumbnail?.url ?? "";
  const fullUrl = full?.url ?? "";

  const srcSetParts: string[] = [];
  if (thumbUrl) srcSetParts.push(`${thumbUrl} 400w`);
  if (fullUrl) srcSetParts.push(`${fullUrl} 1200w`);
  const srcSet = srcSetParts.length > 0 ? srcSetParts.join(", ") : undefined;

  return (
    <img
      src={thumbUrl || fullUrl || undefined}
      srcSet={srcSet}
      sizes={srcSet ? "(max-width: 600px) 400px, 1200px" : undefined}
      alt=""
    />
  );
}
```

### 3. Lazy Load Below-the-Fold Content

```tsx
function LazyImage({ folderPath, basename }: Props) {
  const file = useQuery(api.publicFiles.getPublicFile, { folderPath, basename });

  return <img src={file?.url} loading="lazy" alt="" />;
}
```

## Comparison: Public vs Private Files

| Aspect        | Public Files              | Private Files                     |
| ------------- | ------------------------- | --------------------------------- |
| Auth required | No                        | Yes                               |
| URL type      | Direct CDN URL            | Signed URL via HTTP endpoint      |
| Caching       | CDN + Browser             | Browser only (signed URL expires) |
| Performance   | Fastest (edge-cached)     | Slight overhead (auth + signing)  |
| Use case      | Marketing, public content | User data, premium content        |

## Next Steps

- [Private Files with Signed URLs](./private-files.md) - For auth-protected content
- [Setting Up R2](./setup-r2.md) - Configure Cloudflare R2 storage
