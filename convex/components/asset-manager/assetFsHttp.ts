// convex/assetFsHttp.ts
import { action, internalQuery, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { type Id } from "./_generated/dataModel";
import { v } from "convex/values";

/**
 * Get the R2 public URL from storage config.
 * Requires r2PublicUrl to be configured (no fallback to signed URLs).
 */
async function getR2PublicUrl(ctx: QueryCtx, r2Key: string): Promise<string | null> {
  const config = await ctx.db
    .query("storageConfig")
    .withIndex("by_singleton", (q) => q.eq("singleton", "storageConfig"))
    .first();

  if (!config?.r2PublicUrl) {
    console.error("R2 public URL not configured. Call configureStorageBackend with r2PublicUrl.");
    return null;
  }

  const baseUrl = config.r2PublicUrl.replace(/\/+$/, "");
  return `${baseUrl}/${r2Key}`;
}

/**
 * Internal action that fetches a blob from component storage.
 * This is needed because HTTP actions in the main app cannot access
 * component storage directly - they can only access main app storage.
 * By using an action inside the component, we can access component storage
 * and return the blob data to the HTTP action.
 */
export const getBlobForServing = action({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.null(), v.bytes()),
  handler: async (ctx, { storageId }): Promise<ArrayBuffer | null> => {
    const blob = await ctx.storage.get(storageId);
    if (!blob) return null;
    return await blob.arrayBuffer();
  },
});

const SMALL_FILE_LIMIT = 20 * 1024 * 1024; // 20MB

/**
 * Get a direct storage URL for any version (regardless of state).
 * This is for admin preview only - it doesn't enforce published-only access.
 * Returns the storage URL which can be used to preview archived versions.
 */
export const getVersionPreviewUrl = query({
  args: { versionId: v.id("assetVersions") },
  returns: v.union(
    v.null(),
    v.object({
      url: v.string(),
      contentType: v.optional(v.string()),
      size: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { versionId }) => {
    const version = await ctx.db.get(versionId);
    if (!version) return null;

    // Need either storageId (Convex) or r2Key (R2)
    if (!version.storageId && !version.r2Key) return null;

    let url: string | null = null;
    if (version.r2Key) {
      url = await getR2PublicUrl(ctx, version.r2Key);
    } else if (version.storageId) {
      url = await ctx.storage.getUrl(version.storageId);
    }
    if (!url) return null;

    return { url, contentType: version.contentType, size: version.size };
  },
});

/**
 * Get version data for HTTP serving.
 *
 * Serves ANY version that has storage, regardless of state (published/archived).
 * Version IDs are opaque UUIDs - knowing an ID is sufficient authorization.
 * The "published" concept is about which version is "current" at a path, not access control.
 *
 * Caching strategy:
 * - Convex storage, small files (≤20MB): Served as blobs with immutable caching (1 year)
 * - Convex storage, large files (>20MB): Served via redirect to storage URL with short caching (60s)
 * - R2 storage: Redirect to public URL with immutable caching (Cloudflare CDN handles caching)
 */
export const getVersionForServing = query({
  args: { versionId: v.id("assetVersions") },
  returns: v.union(
    v.null(),
    v.object({
      kind: v.literal("blob"),
      storageId: v.id("_storage"),
      contentType: v.optional(v.string()),
      cacheControl: v.optional(v.string()),
    }),
    v.object({
      kind: v.literal("redirect"),
      location: v.string(),
      cacheControl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { versionId }) => {
    const version = await ctx.db.get(versionId);
    if (!version) return null;

    // Need either storageId (Convex) or r2Key (R2)
    if (!version.storageId && !version.r2Key) return null;

    const size = version.size ?? 0;
    const mime = version.contentType ?? "application/octet-stream";

    // R2 storage: redirect to public URL (Cloudflare CDN handles caching)
    if (version.r2Key) {
      const url = await getR2PublicUrl(ctx, version.r2Key);
      if (!url) return null;

      return {
        kind: "redirect" as const,
        location: url,
        // R2 public URLs are stable, Cloudflare CDN caches at edge
        cacheControl: "public, max-age=31536000, immutable",
      };
    }

    // Convex storage
    const isSmall = size > 0 && size <= SMALL_FILE_LIMIT;

    if (isSmall && version.storageId) {
      return {
        kind: "blob" as const,
        storageId: version.storageId,
        contentType: mime,
        cacheControl: "public, max-age=31536000, immutable",
      };
    }

    const url = await ctx.storage.getUrl(version.storageId!);
    if (!url) return null;

    return { kind: "redirect" as const, location: url, cacheControl: "public, max-age=60" };
  },
});

/**
 * Get the published version of an asset by path, ready for HTTP serving.
 * This is the "one request" pattern - look up by path and get serving info in one call.
 *
 * Returns redirect info (to R2 CDN or Convex storage URL) or blob serving info.
 * Returns null if no published version exists at the path.
 *
 * Usage in app's http.ts:
 * ```typescript
 * http.route({
 *   path: "/file/*",
 *   method: "GET",
 *   handler: httpAction(async (ctx, request) => {
 *     const pathParts = new URL(request.url).pathname.replace(/^\/file\//, '').split('/');
 *     const basename = pathParts.pop()!;
 *     const folderPath = pathParts.join('/');
 *
 *     const result = await ctx.runQuery(
 *       components.assetManager.assetFsHttp.getPublishedFileForServing,
 *       { folderPath, basename }
 *     );
 *     if (!result) return new Response("Not found", { status: 404 });
 *
 *     if (result.kind === "redirect") {
 *       return new Response(null, {
 *         status: 302,
 *         headers: {
 *           Location: result.location,
 *           "Cache-Control": result.cacheControl ?? "public, max-age=60",
 *         },
 *       });
 *     }
 *
 *     // For blob serving, call the action to get the blob
 *     const blob = await ctx.runAction(
 *       components.assetManager.assetFsHttp.getBlobForServing,
 *       { storageId: result.storageId }
 *     );
 *     if (!blob) return new Response("Not found", { status: 404 });
 *
 *     return new Response(blob, {
 *       headers: {
 *         "Content-Type": result.contentType ?? "application/octet-stream",
 *         "Cache-Control": result.cacheControl ?? "public, max-age=31536000, immutable",
 *       },
 *     });
 *   }),
 * });
 * ```
 */
export const getPublishedFileForServing = query({
  args: { folderPath: v.string(), basename: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      kind: v.literal("blob"),
      storageId: v.id("_storage"),
      contentType: v.optional(v.string()),
      cacheControl: v.optional(v.string()),
    }),
    v.object({
      kind: v.literal("redirect"),
      location: v.string(),
      cacheControl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { folderPath, basename }) => {
    // Look up the asset by path
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", folderPath).eq("basename", basename),
      )
      .first();

    if (!asset || !asset.publishedVersionId) return null;

    const version = await ctx.db.get(asset.publishedVersionId);
    if (!version) return null;

    // Need either storageId (Convex) or r2Key (R2)
    if (!version.storageId && !version.r2Key) return null;

    const size = version.size ?? 0;
    const mime = version.contentType ?? "application/octet-stream";

    // R2 storage: redirect to public URL (Cloudflare CDN handles caching)
    if (version.r2Key) {
      const url = await getR2PublicUrl(ctx, version.r2Key);
      if (!url) return null;

      return {
        kind: "redirect" as const,
        location: url,
        cacheControl: "public, max-age=31536000, immutable",
      };
    }

    // Convex storage
    const isSmall = size > 0 && size <= SMALL_FILE_LIMIT;

    if (isSmall && version.storageId) {
      return {
        kind: "blob" as const,
        storageId: version.storageId,
        contentType: mime,
        cacheControl: "public, max-age=31536000, immutable",
      };
    }

    const url = await ctx.storage.getUrl(version.storageId!);
    if (!url) return null;

    return { kind: "redirect" as const, location: url, cacheControl: "public, max-age=60" };
  },
});

/** Result type for getTextContent action */
type TextContentResult = { content: string; contentType?: string } | null;

/**
 * Fetch text content from a version, bypassing CORS issues.
 *
 * This action fetches content server-side and returns it as a string.
 * Use this for text files (XML, JSON, etc.) that need to be read by JavaScript
 * and would otherwise have CORS issues with cross-origin redirects.
 *
 * For binary content or large files, use the HTTP endpoint with redirects instead.
 *
 * @param versionId - The version to fetch content from
 * @returns The text content, or null if not found or not text
 */
export const getTextContent = action({
  args: { versionId: v.id("assetVersions") },
  returns: v.union(
    v.null(),
    v.object({ content: v.string(), contentType: v.optional(v.string()) }),
  ),
  handler: async (ctx, { versionId }): Promise<TextContentResult> => {
    // Get version info
    const versionInfo = await ctx.runQuery(internal.assetFsHttp.getVersionInfo, { versionId });
    if (!versionInfo) return null;

    let content: string | null = null;

    if (versionInfo.storageId) {
      // Convex storage: get blob directly
      const storageBlob = await ctx.storage.get(versionInfo.storageId as Id<"_storage">);
      if (!storageBlob) return null;
      content = await storageBlob.text();
    } else if (versionInfo.url) {
      // R2 storage: fetch from URL server-side (no CORS issues)
      try {
        const response = await fetch(versionInfo.url);
        if (!response.ok) return null;
        content = await response.text();
      } catch (e) {
        console.error("Failed to fetch text content from R2:", e);
        return null;
      }
    }

    if (content === null) return null;

    return { content, contentType: versionInfo.contentType };
  },
});

/**
 * Internal query to get version info for text content fetching.
 */
export const getVersionInfo = internalQuery({
  args: { versionId: v.id("assetVersions") },
  returns: v.union(
    v.null(),
    v.object({
      storageId: v.optional(v.id("_storage")),
      url: v.optional(v.string()),
      contentType: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { versionId }) => {
    const version = await ctx.db.get(versionId);
    if (!version) return null;

    // Need either storageId (Convex) or r2Key (R2)
    if (!version.storageId && !version.r2Key) return null;

    let url: string | undefined;
    if (version.r2Key) {
      const r2Url = await getR2PublicUrl(ctx, version.r2Key);
      if (r2Url) url = r2Url;
    }

    return { storageId: version.storageId, url, contentType: version.contentType };
  },
});
