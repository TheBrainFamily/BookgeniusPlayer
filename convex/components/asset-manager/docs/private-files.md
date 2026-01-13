# Private Files with Signed URLs

This guide covers serving private files that require authentication. Users must be authorized to access these files, and URLs are time-limited.

## Overview

The private files pattern uses:

- **Signed URLs**: Time-limited URLs that expire (prevents unauthorized sharing)
- **Convex reactivity**: When a file version changes, the UI updates automatically
- **Browser caching**: Files are cached by version, so unchanged files aren't re-downloaded

## Architecture

```
┌─────────────────┐     1. useQuery (reactive)      ┌─────────────────┐
│                 │ ◄────────────────────────────── │                 │
│   React App     │     returns { versionId, ... }  │     Convex      │
│                 │                                 │                 │
└────────┬────────┘                                 └────────┬────────┘
         │                                                   │
         │ 2. GET /private/v/{versionId}/path                │
         │    (with auth header)                             │
         ▼                                                   │
┌─────────────────┐     3. Validate auth                     │
│                 │ ────────────────────────────────────────►│
│  HTTP Endpoint  │     4. Generate signed URL               │
│                 │ ◄────────────────────────────────────────┤
└────────┬────────┘                                          │
         │                                                   │
         │ 5. 302 Redirect to signed URL                     │
         ▼                                                   │
┌─────────────────┐                                          │
│   R2 / Convex   │                                          │
│    Storage      │                                          │
└─────────────────┘
```

## Why VersionId in the URL?

Including the versionId in the URL provides:

1. **Reactivity**: When the published version changes, Convex pushes the new versionId to your app. The URL changes, triggering a fresh fetch.

2. **Caching**: Each versionId URL is immutable—the content never changes. Browsers can cache aggressively with `Cache-Control: immutable`.

3. **Consistency**: Users in the same session see the same version, even during updates.

## Implementation

### Step 1: Create the HTTP Endpoint

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { components } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/private/v/*",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // 1. Authenticate the request
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.slice(7);
    // Validate token and get user identity
    // This depends on your auth setup (Clerk, Auth0, custom, etc.)
    const identity = await validateToken(ctx, token);
    if (!identity) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 2. Parse the URL: /private/v/{versionId}/...
    const url = new URL(request.url);
    const pathAfterPrefix = url.pathname.replace(/^\/private\/v\//, "");
    const slashIndex = pathAfterPrefix.indexOf("/");

    if (slashIndex === -1) {
      return new Response("Invalid path", { status: 400 });
    }

    const versionId = pathAfterPrefix.slice(0, slashIndex);
    // Rest of path can be used for permission checks if needed
    // const filePath = pathAfterPrefix.slice(slashIndex + 1);

    // 3. Optional: Check user has permission to access this file
    // await checkPermission(ctx, identity, versionId);

    // 4. Generate signed URL
    const signedUrl = await ctx.runAction(components.assetManager.signedUrl.getSignedUrl, {
      versionId: versionId as any,
      expiresIn: 3600, // 1 hour - good for audio/video seeking
      r2Config: {
        R2_BUCKET: process.env.R2_BUCKET!,
        R2_ENDPOINT: process.env.R2_ENDPOINT!,
        R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
        R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });

    if (!signedUrl) {
      return new Response("Not found", { status: 404 });
    }

    // 5. Redirect with immutable caching
    // (URL contains versionId, so content at this URL never changes)
    return new Response(null, {
      status: 302,
      headers: { Location: signedUrl, "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }),
});

export default http;
```

### Step 2: Query for File Metadata

Create a query that returns the versionId along with other file metadata:

```typescript
// convex/files.ts
import { query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

export const getPrivateFile = query({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, { folderPath, basename }) => {
    // Get the published file info from the component
    const file = await ctx.runQuery(components.assetManager.assetManager.getPublishedFile, {
      folderPath,
      basename,
    });

    if (!file) return null;

    // Return metadata including versionId for the URL
    return {
      versionId: file.versionId, // Used in URL for reactivity
      basename: file.basename,
      contentType: file.contentType,
      size: file.size,
    };
  },
});
```

### Step 3: Use in React

```tsx
// components/PrivateAudioPlayer.tsx
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuth } from "./YourAuthProvider"; // Your auth solution

export function PrivateAudioPlayer({
  folderPath,
  basename,
}: {
  folderPath: string;
  basename: string;
}) {
  const { token } = useAuth();
  const file = useQuery(api.files.getPrivateFile, { folderPath, basename });

  if (!file) return <div>Loading...</div>;

  // Build the private file URL with versionId
  const fileUrl = `/private/v/${file.versionId}/${folderPath}/${basename}`;

  return (
    <audio
      controls
      src={fileUrl}
      // Pass auth token in request headers
      crossOrigin="use-credentials"
    />
  );
}
```

### Step 4: Configure Fetch with Auth Headers

For `<audio>`, `<video>`, or `<img>` tags to send auth headers, you need a service worker or use fetch directly:

```tsx
// Option A: Use a custom hook with blob URLs
function usePrivateFileUrl(versionId: string | undefined, path: string) {
  const { token } = useAuth();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!versionId || !token) return;

    const url = `/private/v/${versionId}/${path}`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      });

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [versionId, token, path]);

  return blobUrl;
}

// Usage
function PrivateImage({ folderPath, basename }) {
  const file = useQuery(api.files.getPrivateFile, { folderPath, basename });
  const imageUrl = usePrivateFileUrl(file?.versionId, `${folderPath}/${basename}`);

  if (!imageUrl) return <div>Loading...</div>;
  return <img src={imageUrl} alt={basename} />;
}
```

```tsx
// Option B: Use cookies instead of Authorization header
// If your auth uses HTTP-only cookies, the browser sends them automatically
function PrivateImage({ folderPath, basename }) {
  const file = useQuery(api.files.getPrivateFile, { folderPath, basename });

  if (!file) return null;

  return <img src={`/private/v/${file.versionId}/${folderPath}/${basename}`} alt={basename} />;
}
```

## Signed URL Expiration

Choose expiration based on use case:

| Use Case    | Recommended Expiration | Reason                              |
| ----------- | ---------------------- | ----------------------------------- |
| Images      | 300s (5 min)           | Quick loads, limited sharing window |
| Audio/Video | 3600s (1 hour)         | Seeking creates new range requests  |
| Downloads   | 300s (5 min)           | Single download, limit sharing      |
| Long videos | 14400s (4 hours)       | Extended viewing sessions           |

```typescript
// In your HTTP endpoint
const signedUrl = await ctx.runAction(components.assetManager.signedUrl.getSignedUrl, {
  versionId,
  expiresIn: 3600, // Adjust based on content type
  r2Config: getR2Config(),
});
```

## Reactivity in Action

When a file is updated:

1. Admin uploads new version in dashboard
2. `finishUpload` mutation completes the upload
3. Asset's `publishedVersionId` changes
4. All clients with `useQuery(api.files.getPrivateFile, ...)` receive the update
5. React re-renders with new `versionId`
6. `<audio src="/private/v/{newVersionId}/...">` triggers new fetch
7. Browser fetches new version (old version stays in cache but unused)

```
Window A (Admin)                    Window B (User)
      │                                   │
      │ Upload new version                │ Playing audio v1
      │         │                         │
      ▼         │                         │
┌───────────┐   │                    ┌────┴────┐
│ Publish   │───┼───── Convex ──────►│ Query   │
│ v2        │   │      pushes        │ updates │
└───────────┘   │      update        └────┬────┘
                │                         │
                │                         ▼
                │                    Audio src changes
                │                    to v2, refetches
                │                         │
                ▼                         ▼
           v2 is live              User hears v2
```

## Security Considerations

1. **Always validate auth** in the HTTP endpoint before generating signed URLs
2. **Check permissions** if files have per-user or per-role access
3. **Use short expiration** for sensitive files
4. **Don't expose versionId** if it leaks information (use opaque IDs if needed)
5. **HTTPS only** in production

## Next Steps

- [Public Files with CDN](./public-files.md) - For files that don't need auth
- [Setting Up R2](./setup-r2.md) - Configure Cloudflare R2 storage
