# convex-versioned-assets

A Convex component for managing **versioned assets** with full history, automatic CDN delivery, and real-time sync.

## Why This Component?

Most file storage solutions treat uploads as simple key-value stores: upload a file, get a URL. When you upload a new version, you get a new URL and must update all references manually.

**convex-versioned-assets** takes a different approach:

- **Stable references**: An asset at `images/hero` always resolves to its current published version
- **Full version history**: Every upload creates a new version; old versions are archived, not deleted
- **Instant rollback**: Restore any previous version with a single mutation
- **Direct CDN delivery**: File URLs point directly to Cloudflare's edge network, not through Convex
- **Real-time sync**: Changelog-driven subscriptions notify your app of any changes

```
Traditional Storage          convex-versioned-assets
─────────────────────────    ─────────────────────────
Upload v1 → URL_A            Upload v1 → images/hero → v1 (published)
Upload v2 → URL_B            Upload v2 → images/hero → v2 (published)
                                                     → v1 (archived)
Must update all refs!        All refs auto-resolve to v2
Can't restore v1             Restore v1 anytime
```

## Features

| Feature                      | Description                              |
| ---------------------------- | ---------------------------------------- |
| **Version history**          | Every upload preserved, never lost       |
| **Publish/archive workflow** | Explicit states: `published`, `archived` |
| **Instant rollback**         | Restore any previous version             |
| **Audit trail**              | Full changelog with who/what/when        |
| **Direct CDN URLs**          | Bypass Convex for file delivery          |
| **Dual storage backends**    | Convex storage or Cloudflare R2          |
| **Folder organization**      | Virtual filesystem with `/path/to/asset` |
| **Real-time sync**           | Subscribe to changes via changelog       |

## Quick Start

### Installation

```bash
npm install convex-versioned-assets
```

### Configuration

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import assetManager from "convex-versioned-assets/convex.config";

const app = defineApp();
app.use(assetManager);
export default app;
```

### Upload a File

```typescript
// 1. Start the upload (get presigned URL)
const { intentId, uploadUrl } = await ctx.runMutation(
  components.assetManager.assetManager.startUpload,
  { folderPath: "images", basename: "hero", filename: "hero.png" },
);

// 2. Upload to the presigned URL
await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

// 3. Finalize (creates version, publishes automatically)
await ctx.runMutation(components.assetManager.assetManager.finishUpload, {
  intentId,
  size: file.size,
  contentType: file.type,
});
```

### Serve a File

```typescript
// convex/files.ts
import { query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

export const getFileUrl = query({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, { folderPath, basename }) => {
    return ctx.runQuery(components.assetManager.assetManager.getPublishedFile, {
      folderPath,
      basename,
    });
  },
});
```

```tsx
// React component
function Image({ path, name }: { path: string; name: string }) {
  const file = useQuery(api.files.getFileUrl, { folderPath: path, basename: name });
  if (!file) return null;
  return <img src={file.url} alt={name} />;
}
```

When you upload a new version of `images/hero`, all components using this query automatically re-render with the new URL.

## Serving Files

### Architecture: Direct CDN Delivery

Unlike solutions that route every file request through your backend, **convex-versioned-assets** returns URLs that point directly to the CDN:

```
┌─────────────────┐     1. useQuery (reactive)      ┌─────────────────┐
│                 │ ◄────────────────────────────── │                 │
│   React App     │     returns { url, versionId }  │     Convex      │
│                 │                                 │                 │
└────────┬────────┘                                 └─────────────────┘
         │
         │ 2. Direct request (no Convex hop!)
         │    https://cdn.example.com/images/hero-v3.png
         ▼
┌─────────────────┐
│   Cloudflare    │  ← Served from nearest edge
│      CDN        │  ← ~10-50ms globally
└─────────────────┘
```

**Why this matters for performance:**

| Approach                        | European user loading 50 images     |
| ------------------------------- | ----------------------------------- |
| Route through backend           | 50 × (100-300ms to US + CDN) = slow |
| **Direct CDN (this component)** | 50 × (10-50ms to edge) = fast       |

The only Convex round-trip is the initial query to get URLs. All file delivery bypasses Convex entirely.

### Public Files

For content that doesn't require authentication:

```typescript
const file = useQuery(api.files.getFileUrl, { folderPath: "images", basename: "hero" });
// file.url → "https://cdn.yourdomain.com/abc123/hero.png"
// Points directly to Cloudflare CDN
```

### Private Files

For content requiring authentication, use the HTTP endpoint pattern with signed URLs:

```typescript
// In your HTTP handler
const result = await ctx.runQuery(components.assetManager.assetFsHttp.getPublishedFileForServing, {
  folderPath,
  basename,
});

if (result.kind === "redirect") {
  return new Response(null, {
    status: 302,
    headers: { Location: result.location, "Cache-Control": result.cacheControl },
  });
}
```

See [Private Files Guide](./docs/private-files.md) for full implementation.

## Version Management

### How Versions Work

Each asset maintains a pointer to its current published version:

```
Asset: images/hero
├── publishedVersionId → points to v3
│
└── Versions:
    ├── v1 (archived) - uploaded Jan 1
    ├── v2 (archived) - uploaded Jan 15
    └── v3 (published) - uploaded Feb 1  ← current
```

When you query `images/hero`, you always get v3's URL. When you upload a new version, v3 becomes archived and v4 becomes published.

### Listing Versions

```typescript
const versions = await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, {
  folderPath: "images",
  basename: "hero",
});

// Returns all versions with metadata:
// [
//   { version: 3, state: "published", createdAt: ..., size: ..., contentType: ... },
//   { version: 2, state: "archived", createdAt: ..., size: ..., contentType: ... },
//   { version: 1, state: "archived", createdAt: ..., size: ..., contentType: ... },
// ]
```

### Restoring a Previous Version

```typescript
await ctx.runMutation(components.assetManager.assetManager.restoreVersion, {
  versionId: previousVersionId,
});
// v1 is now published, v3 is archived
// All queries automatically return v1's URL
```

### Version States

| State       | Description                                       |
| ----------- | ------------------------------------------------- |
| `published` | Current live version (only one per asset)         |
| `archived`  | Previous versions, preserved for history/rollback |

## Real-Time Sync with Changelog

The component maintains a changelog of all operations, enabling efficient sync:

```typescript
// Subscribe to changes since a cursor
const { changes, nextCursor } = await ctx.runQuery(components.assetManager.changelog.listSince, {
  cursor: { createdAt: lastSync, id: "" },
  limit: 100,
});

// changes: [
//   { changeType: "asset:publish", folderPath: "images", basename: "hero", ... },
//   { changeType: "folder:create", folderPath: "images/avatars", ... },
// ]
```

Change types tracked:

- `folder:create`, `folder:update`, `folder:delete`
- `asset:create`, `asset:publish`, `asset:update`, `asset:archive`, `asset:delete`
- `asset:move`, `asset:rename`

### Example: Local Filesystem Sync Daemon

The changelog enables powerful sync tools. See `apps/convex-sync/` for a complete example that maintains a **live local filesystem mirror** of your Convex assets:

```
┌─────────────────┐     WebSocket subscription     ┌─────────────────┐
│   Local Disk    │ ◄──────────────────────────── │     Convex      │
│                 │     changelog.listSince        │   Asset Manager │
│  /sync-folder/  │                                │                 │
│  ├── images/    │     Initial sync + real-time   │  changelog DB   │
│  │   └── hero   │     updates via cursor         │                 │
│  └── sounds/    │                                │                 │
└─────────────────┘                                └─────────────────┘
```

The daemon:

- Performs initial sync of all folders and files
- Subscribes to real-time changelog updates via WebSocket
- Processes each change type (publish, archive, move, rename, delete)
- Tracks downloaded versions via filesystem extended attributes (xattr)
- Resumes from last cursor on restart (no re-download of unchanged files)

```bash
# Run the sync daemon
bun apps/convex-sync/src/index.ts --sync-dir ./local-assets
```

This pattern can be adapted for:

- **Development/AI workflows**: Work with assets locally, agents can easily search through the files using their favorite fs tools
- **Build pipelines**: Sync assets to a build server for static site generation
- **Backup systems**: Maintain an offline copy of all assets

## Storage Backends

### Convex Storage (Default)

Built-in, zero configuration. Good for development and smaller files.

### Cloudflare R2

For production workloads with global CDN delivery:

```typescript
await ctx.runMutation(components.assetManager.assetManager.configureStorageBackend, {
  backend: "r2",
  r2PublicUrl: "https://assets.yourdomain.com",
  r2KeyPrefix: "myapp", // optional namespace
});
```

Benefits of R2:

- Global CDN via Cloudflare's edge network
- Lower egress costs than S3
- Custom domain support
- No per-request backend latency

See [Setting Up R2](./docs/setup-r2.md) for full configuration.

## Comparison with Alternatives

### vs. convex-fs

These components solve **different problems**. Choose based on your access control needs.

Both require external CDN setup:

- **convex-fs**: Bunny.net account (works with default `*.b-cdn.net` subdomain, custom domain optional)
- **convex-versioned-assets**: Cloudflare R2 bucket + **custom domain required** (e.g., `assets.yourdomain.com`)

#### Where convex-fs wins

| Capability                        | convex-fs                                            | convex-versioned-assets          |
| --------------------------------- | ---------------------------------------------------- | -------------------------------- |
| **Per-request authorization**     | Every file request validates permissions             | Only initial query checks auth   |
| **Mid-session access revocation** | Revoke access, next request fails immediately        | URL remains valid until expiry   |
| **Shareable download links**      | Built-in grants with max uses, expiration, passwords | Manual (signed URLs with expiry) |
| **File deduplication**            | Automatic                                            | Not included                     |
| **File expiration**               | Auto-cleanup of temporary uploads                    | Manual cleanup                   |

#### Where convex-versioned-assets wins

| Capability                | convex-fs                                         | convex-versioned-assets              |
| ------------------------- | ------------------------------------------------- | ------------------------------------ |
| **Version history**       | Overwrite = previous version gone                 | All versions preserved forever       |
| **Rollback**              | Not possible                                      | Single mutation restores any version |
| **Audit trail**           | Current state only                                | Full changelog (who/what/when)       |
| **File delivery latency** | Every request routes through Convex HTTP          | Direct CDN (no backend hop)          |
| **Global performance**    | EU users: +100-300ms per file (Convex round-trip) | EU users: ~10-50ms (edge only)       |

#### Choose convex-fs if:

- You need **fine-grained access control** (user A can see file X, user B cannot)
- You need to **revoke access immediately** (e.g., user subscription expires mid-session)
- You want **shareable links** with download limits and passwords
- You're building a **multi-tenant SaaS** where users shouldn't access each other's files

#### Choose convex-versioned-assets if:

- You need **version history and rollback** (CMS, asset libraries, content pipelines)
- Your content is **public or auth-checked once** (not per-request)
- **Global performance** matters (media-heavy sites, international users)
- You need an **audit trail** of all changes

#### The fundamental trade-off

```
convex-fs:                    convex-versioned-assets:
─────────────────────────     ─────────────────────────
Security over speed           Speed over per-request auth

Every file request:           Every file request:
Browser → Convex → CDN        Browser → CDN (direct)

Can revoke access anytime     URLs valid until signed expiry
No version history            Full version history
```

### vs. Raw Convex Storage

| Aspect                  | Raw storage              | convex-versioned-assets               |
| ----------------------- | ------------------------ | ------------------------------------- |
| **Versioning**          | Manual                   | Automatic                             |
| **Stable references**   | No (new upload = new ID) | Yes (path always resolves to current) |
| **Folder organization** | Manual                   | Built-in                              |
| **History/rollback**    | Manual                   | Built-in                              |
| **R2 support**          | Manual                   | Built-in                              |

## API Reference

### Mutations

| Function                     | Description                             |
| ---------------------------- | --------------------------------------- |
| `configureStorageBackend`    | Set storage backend (convex/r2)         |
| `startUpload`                | Begin upload, get presigned URL         |
| `finishUpload`               | Complete upload, create version         |
| `createVersionFromStorageId` | Create version from existing storage ID |
| `createFolderByPath`         | Create a folder                         |
| `restoreVersion`             | Restore a previous version              |
| `moveAsset`                  | Move asset to different folder          |
| `renameAsset`                | Rename an asset                         |
| `deleteAsset`                | Soft-delete an asset                    |

### Queries

| Function                     | Description                        |
| ---------------------------- | ---------------------------------- |
| `getPublishedFile`           | Get published version with URL     |
| `listPublishedFilesInFolder` | List all published files in folder |
| `getAssetVersions`           | Get all versions of an asset       |
| `listFolders`                | List subfolders                    |
| `getFolder`                  | Get folder by path                 |
| `changelog.listSince`        | Get changes since cursor           |
| `changelog.listForFolder`    | Get changes for specific folder    |

### Actions

| Function         | Description                                    |
| ---------------- | ---------------------------------------------- |
| `getSignedUrl`   | Generate time-limited URL for private access   |
| `getTextContent` | Fetch text content server-side (bypasses CORS) |

## Concepts

### Assets

An **asset** is identified by `folderPath` + `basename`:

```
images/hero        → Asset
sounds/intro       → Asset
books/hamlet/cover → Asset
```

### Versions

Each asset can have multiple **versions**. Only one is `published` at a time:

```
images/hero
  ├── v1 (archived)
  ├── v2 (archived)
  └── v3 (published)  ← queries return this
```

### Folders

Virtual folder hierarchy for organization:

```
/
├── images/
│   ├── hero
│   └── avatars/
│       ├── user-1
│       └── user-2
└── sounds/
    └── intro
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Your App                           │
├─────────────────────────────────────────────────────────┤
│  Queries           │  Mutations        │  HTTP Routes   │
│  - getPublishedFile│  - startUpload    │  - /file/*     │
│  - listFiles       │  - finishUpload   │  - /private/*  │
│  - getVersions     │  - restoreVersion │                │
└────────┬───────────┴────────┬──────────┴───────┬────────┘
         │                    │                  │
         ▼                    ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│              convex-versioned-assets                    │
├─────────────────────────────────────────────────────────┤
│  • Version management (publish/archive/restore)         │
│  • Folder organization                                  │
│  • Upload orchestration                                 │
│  • Changelog tracking                                   │
│  • URL generation (direct CDN)                          │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Convex Storage  │ OR  │  Cloudflare R2  │
│   (default)     │     │   (production)  │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Cloudflare CDN │
                        │  (global edge)  │
                        └─────────────────┘
```

## Documentation

| Guide                                               | Description                     |
| --------------------------------------------------- | ------------------------------- |
| [Setting Up R2](./docs/setup-r2.md)                 | Configure Cloudflare R2 storage |
| [Public Files](./docs/public-files.md)              | Serve files through CDN         |
| [Private Files](./docs/private-files.md)            | Auth-protected file access      |
| [WebP Conversion](./docs/webp-cloudflare-worker.md) | Image optimization              |

## License

MIT
