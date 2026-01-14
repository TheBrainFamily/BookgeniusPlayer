# Asset Manager Component

A Convex component for managing versioned assets with support for both Convex storage and Cloudflare R2.

## Features

- **Versioned assets**: Track file versions with published/archived states
- **Dual storage backends**: Use Convex storage or Cloudflare R2
- **CDN support**: Serve public files through Cloudflare's global CDN
- **Signed URLs**: Time-limited access for private files
- **Reactive queries**: UI updates automatically when files change
- **Folder organization**: Organize assets in a folder hierarchy

## Quick Start

### Installation

```bash
npm install @your-org/asset-manager
```

### Configuration

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import assetManager from "@your-org/asset-manager/convex.config";

const app = defineApp();
app.use(assetManager);
export default app;
```

### Basic Usage

```typescript
// Upload a file
const { intentId, uploadUrl } = await ctx.runMutation(
  components.assetManager.assetManager.startUpload,
  { folderPath: "images", basename: "hero", filename: "hero.png" },
);

// Upload to the URL, then finish
await ctx.runMutation(components.assetManager.assetManager.finishUpload, {
  intentId,
  size: file.size,
  contentType: file.type,
});

// Query the file
const file = await ctx.runQuery(components.assetManager.assetManager.getPublishedFile, {
  folderPath: "images",
  basename: "hero",
});

console.log(file.url); // Direct URL to the file
```

## Storage Backends

### Convex Storage (Default)

Built-in storage, no configuration needed. Good for getting started and smaller files.

### Cloudflare R2

For production workloads with:

- Global CDN distribution
- Lower egress costs
- Custom domains
- Larger file support

See [Setting Up R2](./setup-r2.md) for configuration.

## Access Patterns

### Public Files

For content that doesn't require authentication:

- Marketing assets, public images, audio/video
- Served directly from CDN
- Maximum caching and performance

```tsx
const file = useQuery(api.files.getPublicFile, { folderPath, basename });
return <img src={file?.url} />;
```

See [Public Files with CDN](./public-files.md) for details.

### Private Files

For content that requires authentication:

- User uploads, premium content, sensitive documents
- Time-limited signed URLs
- Auth checked on each request

```tsx
const file = useQuery(api.files.getPrivateFile, { folderPath, basename });
return <img src={`/private/v/${file?.versionId}/${folderPath}/${basename}`} />;
```

See [Private Files with Signed URLs](./private-files.md) for details.

## Documentation

| Guide                                                   | Description                                    |
| ------------------------------------------------------- | ---------------------------------------------- |
| [Setting Up R2](./setup-r2.md)                          | Configure Cloudflare R2 storage and CORS       |
| [Public Files](./public-files.md)                       | Serve files through CDN                        |
| [Private Files](./private-files.md)                     | Auth-protected file access                     |
| [WebP - Pure Convex](./webp-pure-convex.md)             | Convert images to WebP in Convex actions       |
| [WebP - Cloudflare Worker](./webp-cloudflare-worker.md) | High-performance WebP conversion via CF Worker |
| [Example Apps Plan](./example-apps-plan.md)             | Roadmap for demo applications                  |

## Concepts

### Assets and Versions

An **asset** is identified by `folderPath` + `basename`:

```
images/hero        → Asset
sounds/intro       → Asset
```

Each asset can have multiple **versions**:

```
images/hero
  ├── v1 (archived)
  ├── v2 (archived)
  └── v3 (published)  ← Current version
```

### Version States

| State       | Description                         |
| ----------- | ----------------------------------- |
| `published` | Current live version                |
| `archived`  | Previous versions, kept for history |

### Upload Flow

```
startUpload() → Upload to URL → finishUpload()
     │                              │
     ▼                              ▼
  Get presigned URL           Create version record
  Create upload intent        Link to asset
```

## API Reference

### Mutations

| Function                  | Description                        |
| ------------------------- | ---------------------------------- |
| `configureStorageBackend` | Set storage backend (convex/r2)    |
| `startUpload`             | Begin an upload, get presigned URL |
| `finishUpload`            | Complete upload, create version    |
| `createFolderByPath`      | Create a folder                    |
| `restoreVersion`          | Restore a previous version         |
| `moveAsset`               | Move asset to different folder     |
| `renameAsset`             | Rename an asset                    |

### Queries

| Function                     | Description                        |
| ---------------------------- | ---------------------------------- |
| `getPublishedFile`           | Get published version with URL     |
| `listPublishedFilesInFolder` | List all published files in folder |
| `getAssetVersions`           | Get all versions of an asset       |
| `listFolders`                | List subfolders                    |
| `getFolder`                  | Get folder by path                 |

### Actions

| Function       | Description                                  |
| -------------- | -------------------------------------------- |
| `getSignedUrl` | Generate time-limited URL for private access |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Your App                            │
├─────────────────────────────────────────────────────────┤
│  Queries          │  Mutations       │  HTTP Endpoints  │
│  - getPublicFile  │  - startUpload   │  - /private/v/*  │
│  - listFiles      │  - finishUpload  │                  │
└────────┬──────────┴────────┬─────────┴────────┬─────────┘
         │                   │                  │
         ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                Asset Manager Component                  │
├─────────────────────────────────────────────────────────┤
│  • Version management                                   │
│  • Folder organization                                  │
│  • Upload orchestration                                 │
│  • URL generation                                       │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Convex Storage  │ OR  │  Cloudflare R2  │
│   (default)     │     │   (optional)    │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Cloudflare CDN │
                        └─────────────────┘
```

## License

MIT
