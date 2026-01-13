# ASSET MANAGER COMPONENT

Reusable Convex component for versioned file storage with dual-backend support.

## OVERVIEW

Abstraction layer for managing media and documents with published/archived versions. Transparently switches between native Convex storage and Cloudflare R2 for CDN-optimized delivery.

## ARCHITECTURE

- **Dual Backend**: Configurable via `storageConfig` singleton. Convex (default) or R2 (high-scale).
- **Versioning**: Assets (`folderPath` + `basename`) track multiple `assetVersions`.
- **States**: Versions transition from `published` (only one active) → `archived`.
- **Folder System**: Virtual hierarchy with path-based lookups and subfolder listing.

## KEY FILES

| File              | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `assetManager.ts` | Core API: version control, folder logic, upload orchestration. |
| `schema.ts`       | Data model: `assets`, `assetVersions`, `uploadIntents`.        |
| `assetFsHttp.ts`  | HTTP serving logic, blob fetching, and R2/Convex redirects.    |
| `r2Client.ts`     | Integration with Cloudflare R2 for presigned upload URLs.      |
| `signedUrl.ts`    | Time-limited access generation for private assets.             |

## UPLOAD FLOW

1. `startUpload`: Creates `uploadIntent`, returns `uploadUrl` (S3/Convex).
2. **Client**: Performs HTTP PUT to the provided URL.
3. `finishUpload`: Validates upload, creates `assetVersion`, updates pointers.

## PUBLIC API

- **Mutations**: `startUpload`, `finishUpload`, `moveAsset`, `renameAsset`, `configureStorageBackend`.
- **Queries**: `getPublishedFile`, `listPublishedFilesInFolder`, `getAssetVersions`, `listFolders`, `getFolder`.
- **Actions**: `getSignedUrl`, `getTextContent` (CORS-safe server-side fetch).
