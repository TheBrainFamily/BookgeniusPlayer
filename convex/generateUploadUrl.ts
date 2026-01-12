import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { adminMutation, authedMutation, publicQuery, publicAction } from "./functions";
import { requireBookWriteAccess } from "./bookAuthz";

/**
 * Extract book path from a folder path.
 * e.g., "books/jane-eyre/music" → "books/jane-eyre"
 * Returns null if not a book folder.
 */
function extractBookPath(folderPath: string): string | null {
  const match = folderPath.match(/^(books\/[^/]+)/);
  return match ? match[1] : null;
}

/**
 * Get R2 config from env vars. Returns undefined if not configured.
 * Called once per request, passed to component functions.
 */
function getR2Config() {
  if (!process.env.R2_BUCKET) return undefined;
  return {
    R2_BUCKET: process.env.R2_BUCKET,
    R2_ENDPOINT: process.env.R2_ENDPOINT!,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
  };
}

// =============================================================================
// Storage Backend Configuration
// =============================================================================

const storageBackendValidator = v.union(v.literal("convex"), v.literal("r2"));

/**
 * Configure which storage backend to use for new uploads - ADMIN ONLY.
 * Default is "convex". Call with "r2" to use Cloudflare R2.
 *
 * For R2, you must provide:
 * - Env vars: R2_BUCKET, R2_TOKEN, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT
 * - r2PublicUrl: The public URL for your R2 bucket (requires custom domain setup in Cloudflare)
 * - r2KeyPrefix (optional): Prefix for R2 keys to avoid collisions when sharing a bucket
 */
export const configureStorageBackend = adminMutation({
  args: {
    backend: storageBackendValidator,
    // Required when backend is "r2" - the public URL for serving files
    r2PublicUrl: v.optional(v.string()),
    // Optional prefix for R2 keys when sharing a bucket across multiple apps
    r2KeyPrefix: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await ctx.runMutation(
      components.assetManager.assetManager.configureStorageBackend,
      args,
    );
  },
});

/**
 * Get the current storage backend configuration.
 */
export const getStorageBackendConfig = publicQuery({
  args: {},
  returns: storageBackendValidator,
  handler: async (ctx) => {
    return await ctx.runQuery(components.assetManager.assetManager.getStorageBackendConfig, {});
  },
});

// =============================================================================
// Upload Flow
// =============================================================================

/**
 * Start an upload. Creates an upload intent and returns the upload URL.
 * Requires book write access for book folders.
 *
 * Flow:
 * 1. Call startUpload() to get intentId + uploadUrl
 * 2. Upload file to the URL
 * 3. Call finishUpload() with intentId (+ storageId for Convex backend)
 */
export const startUpload = authedMutation({
  args: {
    folderPath: v.string(),
    basename: v.string(),
    filename: v.optional(v.string()),
    label: v.optional(v.string()),
    extra: v.optional(v.any()),
  },
  returns: v.object({
    intentId: v.string(),
    backend: storageBackendValidator,
    uploadUrl: v.string(),
    r2Key: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    console.log("[startUpload] Called with", {
      folderPath: args.folderPath,
      basename: args.basename,
    });

    // Check book write access if this is a book folder
    const bookPath = extractBookPath(args.folderPath);
    if (bookPath) {
      await requireBookWriteAccess(ctx, bookPath);
    } else if (!ctx.isAdmin) {
      // Non-book folders require admin
      throw new Error("Forbidden: Only admins can upload to non-book folders");
    }

    const result = await ctx.runMutation(components.assetManager.assetManager.startUpload, {
      ...args,
      r2Config: getR2Config(),
    });

    console.log("[startUpload] Intent created", {
      intentId: result.intentId,
      backend: result.backend,
    });
    return result;
  },
});

// Internal version for scheduled actions (no auth required)
export const startUploadInternal = internalMutation({
  args: {
    folderPath: v.string(),
    basename: v.string(),
    filename: v.optional(v.string()), // Original filename with extension for URLs
    label: v.optional(v.string()),
    extra: v.optional(v.any()),
  },
  returns: v.object({
    intentId: v.string(),
    backend: storageBackendValidator,
    uploadUrl: v.string(),
    r2Key: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.startUpload, {
      ...args,
      r2Config: getR2Config(),
    });
  },
});

/**
 * Finish an upload. Creates the asset version from a completed upload intent.
 * Requires book write access for book folders.
 *
 * Pass the raw JSON response from the upload POST. The backend extracts what
 * it needs based on the storage backend (Convex or R2).
 */
export const finishUpload = authedMutation({
  args: {
    intentId: v.string(),
    uploadResponse: v.optional(v.any()),
    size: v.optional(v.number()),
    contentType: v.optional(v.string()),
    folderPath: v.optional(v.string()),
    basename: v.optional(v.string()),
  },
  returns: v.object({ assetId: v.string(), versionId: v.string(), version: v.number() }),
  handler: async (ctx, args) => {
    console.log("[finishUpload] Called with", {
      intentId: args.intentId,
      folderPath: args.folderPath,
      basename: args.basename,
      contentType: args.contentType,
      size: args.size,
    });

    // Check book write access if this is a book folder
    if (args.folderPath) {
      const bookPath = extractBookPath(args.folderPath);
      if (bookPath) {
        await requireBookWriteAccess(ctx, bookPath);
      } else if (!ctx.isAdmin) {
        throw new Error("Forbidden: Only admins can upload to non-book folders");
      }
    }
    const result = await ctx.runMutation(components.assetManager.assetManager.finishUpload, {
      intentId: args.intentId,
      uploadResponse: args.uploadResponse,
      r2Config: getR2Config(),
      size: args.size,
      contentType: args.contentType,
    });

    console.log("[finishUpload] Asset created", {
      assetId: result.assetId,
      versionId: result.versionId,
    });

    // Schedule music metadata extraction for MP3 files in music/ folder
    if (args.contentType === "audio/mpeg" && args.folderPath?.endsWith("/music") && args.basename) {
      const bookPath = args.folderPath.replace(/\/music$/, "");
      await ctx.scheduler.runAfter(0, internal.musicMetadata.extractFromFile, {
        bookPath,
        fileBasename: args.basename,
      });
    }

    // Schedule preview generation for background files (videos and images)
    if (args.folderPath?.endsWith("/backgrounds") && args.basename) {
      const bookPath = args.folderPath.replace(/\/backgrounds$/, "");
      const isVideo = args.contentType?.startsWith("video/");
      const isImage = args.contentType?.startsWith("image/");

      if (isVideo) {
        await ctx.scheduler.runAfter(0, internal.backgroundMetadata.generateVideoPreview, {
          bookPath,
          fileBasename: args.basename,
        });
      } else if (isImage) {
        await ctx.scheduler.runAfter(0, internal.backgroundMetadata.generateImagePreview, {
          bookPath,
          fileBasename: args.basename,
        });
      }
    }

    // Schedule avatar.webp generation when avatar-large.* is uploaded to a character folder
    if (args.folderPath?.includes("/characters/") && args.basename?.startsWith("avatar-large.")) {
      await ctx.scheduler.runAfter(0, internal.avatarGeneration.processUploadedAvatarLarge, {
        characterPath: args.folderPath,
      });
    }

    return result;
  },
});

// Internal version for scheduled actions (no auth required)
export const finishUploadInternal = internalMutation({
  args: {
    intentId: v.string(),
    uploadResponse: v.optional(v.any()),
    size: v.optional(v.number()),
    contentType: v.optional(v.string()),
    folderPath: v.optional(v.string()),
    basename: v.optional(v.string()),
  },
  returns: v.object({ assetId: v.string(), versionId: v.string(), version: v.number() }),
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(components.assetManager.assetManager.finishUpload, {
      intentId: args.intentId,
      uploadResponse: args.uploadResponse,
      r2Config: getR2Config(),
      size: args.size,
      contentType: args.contentType,
    });

    // Schedule preview generation for background files (videos and images)
    if (args.folderPath?.endsWith("/backgrounds") && args.basename) {
      const bookPath = args.folderPath.replace(/\/backgrounds$/, "");
      const isVideo = args.contentType?.startsWith("video/");
      const isImage = args.contentType?.startsWith("image/");

      if (isVideo) {
        await ctx.scheduler.runAfter(0, internal.backgroundMetadata.generateVideoPreview, {
          bookPath,
          fileBasename: args.basename,
        });
      } else if (isImage) {
        await ctx.scheduler.runAfter(0, internal.backgroundMetadata.generateImagePreview, {
          bookPath,
          fileBasename: args.basename,
        });
      }
    }

    return result;
  },
});

// =============================================================================
// Signed URL Generation (for private file access)
// =============================================================================

/**
 * Generate a signed URL for private file access.
 * Works with both Convex storage and R2.
 *
 * NOTE: This is public - for private files, implement your own auth wrapper.
 *
 * For audio/video files, use longer expiration (e.g., 3600 = 1 hour)
 * to handle seeking and buffering during playback.
 */
export const getSignedUrl = publicAction({
  args: {
    versionId: v.string(),
    expiresIn: v.optional(v.number()), // seconds, default 300 (5 min)
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { versionId, expiresIn }) => {
    return await ctx.runAction(components.assetManager.signedUrl.getSignedUrl, {
      versionId,
      expiresIn,
      r2Config: getR2Config(),
    });
  },
});
