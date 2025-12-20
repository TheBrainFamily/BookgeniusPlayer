import { v } from "convex/values";
import { mutation, internalMutation, query, action } from "./_generated/server";
import { components } from "./_generated/api";
import { requireAuth } from "./authHelpers";

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
 * Configure which storage backend to use for new uploads.
 * Default is "convex". Call with "r2" to use Cloudflare R2.
 *
 * For R2, you must provide:
 * - Env vars: R2_BUCKET, R2_TOKEN, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT
 * - r2PublicUrl: The public URL for your R2 bucket (requires custom domain setup in Cloudflare)
 * - r2KeyPrefix (optional): Prefix for R2 keys to avoid collisions when sharing a bucket
 */
export const configureStorageBackend = mutation({
  args: {
    backend: storageBackendValidator,
    // Required when backend is "r2" - the public URL for serving files
    r2PublicUrl: v.optional(v.string()),
    // Optional prefix for R2 keys when sharing a bucket across multiple apps
    r2KeyPrefix: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.runMutation(
      components.assetManager.assetManager.configureStorageBackend,
      args,
    );
  },
});

/**
 * Get the current storage backend configuration.
 */
export const getStorageBackendConfig = query({
  args: {},
  returns: storageBackendValidator,
  handler: async (ctx) => {
    return await ctx.runQuery(
      components.assetManager.assetManager.getStorageBackendConfig,
      {},
    );
  },
});

// =============================================================================
// Upload Flow
// =============================================================================

/**
 * Start an upload. Creates an upload intent and returns the upload URL.
 *
 * Flow:
 * 1. Call startUpload() to get intentId + uploadUrl
 * 2. Upload file to the URL
 * 3. Call finishUpload() with intentId (+ storageId for Convex backend)
 */
export const startUpload = mutation({
  args: {
    folderPath: v.string(),
    basename: v.string(),
    filename: v.optional(v.string()), // Original filename with extension for URLs
    publish: v.optional(v.boolean()),
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
    await requireAuth(ctx);
    return await ctx.runMutation(
      components.assetManager.assetManager.startUpload,
      { ...args, r2Config: getR2Config() },
    );
  },
});

// Internal version for scheduled actions (no auth required)
export const startUploadInternal = internalMutation({
  args: {
    folderPath: v.string(),
    basename: v.string(),
    filename: v.optional(v.string()), // Original filename with extension for URLs
    publish: v.optional(v.boolean()),
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
    return await ctx.runMutation(
      components.assetManager.assetManager.startUpload,
      { ...args, r2Config: getR2Config() },
    );
  },
});

/**
 * Finish an upload. Creates the asset version from a completed upload intent.
 *
 * Pass the raw JSON response from the upload POST. The backend extracts what
 * it needs based on the storage backend (Convex or R2).
 */
export const finishUpload = mutation({
  args: {
    intentId: v.string(),
    // The parsed JSON response from the upload POST request.
    // For Convex: { storageId: "..." }
    // For R2: can be empty (r2Key is in the intent)
    uploadResponse: v.optional(v.any()),
    // Client-provided file metadata (required for R2)
    size: v.optional(v.number()),
    contentType: v.optional(v.string()),
  },
  returns: v.object({
    assetId: v.string(),
    versionId: v.string(),
    version: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.runMutation(
      components.assetManager.assetManager.finishUpload,
      {
        intentId: args.intentId as any,
        uploadResponse: args.uploadResponse,
        r2Config: getR2Config(),
        size: args.size,
        contentType: args.contentType,
      },
    );
  },
});

// Internal version for scheduled actions (no auth required)
export const finishUploadInternal = internalMutation({
  args: {
    intentId: v.string(),
    uploadResponse: v.optional(v.any()),
    size: v.optional(v.number()),
    contentType: v.optional(v.string()),
  },
  returns: v.object({
    assetId: v.string(),
    versionId: v.string(),
    version: v.number(),
  }),
  handler: async (ctx, args) => {
    return await ctx.runMutation(
      components.assetManager.assetManager.finishUpload,
      {
        intentId: args.intentId as any,
        uploadResponse: args.uploadResponse,
        r2Config: getR2Config(),
        size: args.size,
        contentType: args.contentType,
      },
    );
  },
});

// =============================================================================
// Signed URL Generation (for private file access)
// =============================================================================

/**
 * Generate a signed URL for private file access.
 * Works with both Convex storage and R2.
 *
 * NOTE: This does NOT check auth - that's your app's responsibility.
 * Wrap this in your own action that checks permissions first.
 *
 * For audio/video files, use longer expiration (e.g., 3600 = 1 hour)
 * to handle seeking and buffering during playback.
 */
export const getSignedUrl = action({
  args: {
    versionId: v.string(),
    expiresIn: v.optional(v.number()), // seconds, default 300 (5 min)
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { versionId, expiresIn }) => {
    return await ctx.runAction(
      components.assetManager.signedUrl.getSignedUrl,
      {
        versionId: versionId as any,
        expiresIn,
        r2Config: getR2Config(),
      },
    );
  },
});
