/**
 * Background Metadata - Preview generation for background files
 *
 * Handles:
 * - Video previews: via Fly.io FFmpeg worker (small MP4 + WebP)
 * - Image previews: direct resize in Convex action (WebP only)
 *
 * Previews are stored in {bookPath}/background-thumbnails/
 */

import { v } from "convex/values";
import { query, mutation, internalAction, internalMutation } from "./_generated/server";
import { internal, components } from "./_generated/api";

// =============================================================================
// Queries
// =============================================================================

/**
 * Get metadata for a specific background file.
 */
export const getByFile = query({
  args: { bookPath: v.string(), fileBasename: v.string() },
  handler: async (ctx, { bookPath, fileBasename }) => {
    const metadata = await ctx.db
      .query("backgroundFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath).eq("fileBasename", fileBasename))
      .first();

    if (!metadata) return null;

    // Get preview URLs if available
    const previewFiles = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/background-thumbnails` },
    );
    const previewMap = new Map(previewFiles.map((f) => [f.basename, f.url]));

    return {
      ...metadata,
      previewMp4Url: metadata.previewMp4Basename
        ? previewMap.get(metadata.previewMp4Basename)
        : undefined,
      previewWebpUrl: metadata.previewWebpBasename
        ? previewMap.get(metadata.previewWebpBasename)
        : undefined,
    };
  },
});

/**
 * List all metadata for a book (for batch loading).
 */
export const listByBook = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const allMetadata = await ctx.db
      .query("backgroundFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath))
      .collect();

    if (allMetadata.length === 0) return [];

    // Get all preview URLs in one query
    const previewFiles = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/background-thumbnails` },
    );
    const previewMap = new Map(previewFiles.map((f) => [f.basename, f.url]));

    return allMetadata.map((m) => ({
      ...m,
      previewMp4Url: m.previewMp4Basename ? previewMap.get(m.previewMp4Basename) : undefined,
      previewWebpUrl: m.previewWebpBasename ? previewMap.get(m.previewWebpBasename) : undefined,
    }));
  },
});

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Insert or update metadata for a background file.
 */
export const upsertMetadata = internalMutation({
  args: {
    bookPath: v.string(),
    fileBasename: v.string(),
    fileType: v.union(v.literal("video"), v.literal("image")),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    previewMp4Basename: v.optional(v.string()),
    previewWebpBasename: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("backgroundFileMetadata")
      .withIndex("by_book_file", (q) =>
        q.eq("bookPath", args.bookPath).eq("fileBasename", args.fileBasename),
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        fileType: args.fileType,
        status: args.status,
        previewMp4Basename: args.previewMp4Basename,
        previewWebpBasename: args.previewWebpBasename,
        error: args.error,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("backgroundFileMetadata", {
        bookPath: args.bookPath,
        fileBasename: args.fileBasename,
        fileType: args.fileType,
        status: args.status,
        previewMp4Basename: args.previewMp4Basename,
        previewWebpBasename: args.previewWebpBasename,
        error: args.error,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * Update status (used by HTTP webhook after video processing).
 */
export const updateStatus = internalMutation({
  args: {
    bookPath: v.string(),
    fileBasename: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    previewMp4Basename: v.optional(v.string()),
    previewWebpBasename: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("backgroundFileMetadata")
      .withIndex("by_book_file", (q) =>
        q.eq("bookPath", args.bookPath).eq("fileBasename", args.fileBasename),
      )
      .first();

    if (!existing) {
      throw new Error(`Metadata not found for ${args.bookPath}/${args.fileBasename}`);
    }

    await ctx.db.patch(existing._id, {
      status: args.status,
      previewMp4Basename: args.previewMp4Basename ?? existing.previewMp4Basename,
      previewWebpBasename: args.previewWebpBasename ?? existing.previewWebpBasename,
      error: args.error,
      updatedAt: Date.now(),
    });

    return existing._id;
  },
});

// =============================================================================
// Internal Actions - Preview Generation
// =============================================================================

/**
 * Get R2 config from env vars.
 */
function _getR2Config() {
  if (!process.env.R2_BUCKET) return undefined;
  return {
    R2_BUCKET: process.env.R2_BUCKET,
    R2_ENDPOINT: process.env.R2_ENDPOINT!,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
  };
}

/**
 * Generate preview for an image file (direct processing in Convex).
 */
export const generateImagePreview = internalAction({
  args: { bookPath: v.string(), fileBasename: v.string() },
  handler: async (ctx, { bookPath, fileBasename }) => {
    console.log(
      `[backgroundMetadata] Generating image preview for ${bookPath}/backgrounds/${fileBasename}`,
    );

    // 1. Mark as pending
    await ctx.runMutation(internal.backgroundMetadata.upsertMetadata, {
      bookPath,
      fileBasename,
      fileType: "image",
      status: "pending",
    });

    try {
      // 2. Get the source image URL
      const files = await ctx.runQuery(
        components.assetManager.assetManager.listPublishedFilesInFolder,
        { folderPath: `${bookPath}/backgrounds` },
      );
      const file = files.find((f) => f.basename === fileBasename);

      if (!file?.url) {
        throw new Error(`File not found or not published: ${fileBasename}`);
      }

      // 3. Mark as processing
      await ctx.runMutation(internal.backgroundMetadata.updateStatus, {
        bookPath,
        fileBasename,
        status: "processing",
      });

      // 4. Resize image and extract colors via Cloudflare Worker
      const result = await ctx.runAction(internal.imageProcessing.resizeToWebpViaWorker, {
        sourceUrl: file.url,
        maxWidth: 400,
        quality: 80,
        extractColors: true,
      });

      // 5. Upload the preview to background-thumbnails/
      const baseName = fileBasename.replace(/\.[^.]+$/, "");
      const previewBasename = `${baseName}_preview.webp`;
      const thumbnailsPath = `${bookPath}/background-thumbnails`;

      // Convert base64 back to blob
      const binaryData = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
      const blob = new Blob([binaryData], { type: result.mimeType });

      // Start upload
      const { intentId, uploadUrl, backend } = await ctx.runMutation(
        internal.generateUploadUrl.startUploadInternal,
        { folderPath: thumbnailsPath, basename: previewBasename, publish: true },
      );

      // Upload the blob
      const uploadRes = await fetch(uploadUrl, {
        method: backend === "r2" ? "PUT" : "POST",
        body: blob,
        headers: { "Content-Type": result.mimeType },
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      const uploadResponse = backend === "convex" ? await uploadRes.json() : undefined;

      await ctx.runMutation(internal.generateUploadUrl.finishUploadInternal, {
        intentId,
        uploadResponse,
        size: blob.size,
        contentType: result.mimeType,
      });

      // 6. Update metadata as completed
      await ctx.runMutation(internal.backgroundMetadata.updateStatus, {
        bookPath,
        fileBasename,
        status: "completed",
        previewWebpBasename: previewBasename,
      });

      // 7. Update cues with detected colors (only if not already set)
      let colorUpdateResult = { total: 0, updated: 0 };
      if (result.backgroundColor && result.textColor) {
        colorUpdateResult = await ctx.runMutation(
          internal.backgroundCues.updateColorsForFileInternal,
          {
            bookPath,
            fileBasename,
            backgroundColor: result.backgroundColor,
            textColor: result.textColor,
          },
        );
      }

      console.log(
        `[backgroundMetadata] Image preview completed: ${thumbnailsPath}/${previewBasename}, colors: ${result.backgroundColor} (updated ${colorUpdateResult.updated}/${colorUpdateResult.total} cues)`,
      );
    } catch (error) {
      console.error(`[backgroundMetadata] Image preview failed for ${fileBasename}:`, error);
      await ctx.runMutation(internal.backgroundMetadata.updateStatus, {
        bookPath,
        fileBasename,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

/**
 * Generate preview for a video file (via Fly.io Machines API).
 * Spawns a Fly Machine that runs FFmpeg, then calls back via webhook.
 */
export const generateVideoPreview = internalAction({
  args: { bookPath: v.string(), fileBasename: v.string() },
  handler: async (ctx, { bookPath, fileBasename }) => {
    console.log(
      `[backgroundMetadata] Triggering video preview for ${bookPath}/backgrounds/${fileBasename}`,
    );

    // 1. Mark as pending
    await ctx.runMutation(internal.backgroundMetadata.upsertMetadata, {
      bookPath,
      fileBasename,
      fileType: "video",
      status: "pending",
    });

    try {
      // 2. Get the source video URL (signed for external access)
      const files = await ctx.runQuery(
        components.assetManager.assetManager.listPublishedFilesInFolder,
        { folderPath: `${bookPath}/backgrounds` },
      );
      const file = files.find((f) => f.basename === fileBasename);

      if (!file?.url) {
        throw new Error(`File not found or not published: ${fileBasename}`);
      }

      // 3. Mark as processing
      await ctx.runMutation(internal.backgroundMetadata.updateStatus, {
        bookPath,
        fileBasename,
        status: "processing",
      });

      // 4. Spawn a Fly Machine to process the video
      const flyApiToken = process.env.FLY_API_TOKEN;
      const flyAppName = process.env.FLY_APP_NAME || "ffmpeg-worker-slug";
      const flyImageRef =
        process.env.FLY_IMAGE_REF ||
        "registry.fly.io/ffmpeg-worker-slug:deployment-01KD8020MTHTN2SC54SJYFMFSH"; // e.g., "registry.fly.io/ffmpeg-worker-slug:deployment-XXX"

      if (!flyApiToken) {
        throw new Error("FLY_API_TOKEN environment variable not set");
      }
      if (!flyImageRef) {
        throw new Error("FLY_IMAGE_REF environment variable not set");
      }

      const response = await fetch(`https://api.machines.dev/v1/apps/${flyAppName}/machines`, {
        method: "POST",
        headers: { Authorization: `Bearer ${flyApiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            image: flyImageRef,
            auto_destroy: true, // Machine self-destructs after exit
            env: {
              SOURCE_URL: file.url,
              BOOK_PATH: bookPath,
              FILE_BASENAME: fileBasename,
              CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
              PREVIEW_WEBHOOK_SECRET: process.env.PREVIEW_WEBHOOK_SECRET,
            },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fly Machines API returned ${response.status}: ${errorText}`);
      }

      const machine = await response.json();
      console.log(`[backgroundMetadata] Spawned Fly machine ${machine.id} for ${fileBasename}`);

      // Convex function ends here immediately!
      // The Fly machine will call the webhook when done.
    } catch (error) {
      console.error(`[backgroundMetadata] Video preview failed for ${fileBasename}:`, error);
      await ctx.runMutation(internal.backgroundMetadata.updateStatus, {
        bookPath,
        fileBasename,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

// =============================================================================
// Public Mutations - Manual Triggers
// =============================================================================

/**
 * Manually trigger preview generation for a single file.
 */
export const triggerPreviewGeneration = mutation({
  args: {
    bookPath: v.string(),
    fileBasename: v.string(),
    fileType: v.union(v.literal("video"), v.literal("image")),
  },
  handler: async (ctx, { bookPath, fileBasename, fileType }) => {
    if (fileType === "video") {
      await ctx.scheduler.runAfter(0, internal.backgroundMetadata.generateVideoPreview, {
        bookPath,
        fileBasename,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.backgroundMetadata.generateImagePreview, {
        bookPath,
        fileBasename,
      });
    }
    return { scheduled: true };
  },
});

/**
 * Trigger preview generation for all background files in a book.
 */
export const triggerForBook = mutation({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/backgrounds` },
    );

    let videoCount = 0;
    let imageCount = 0;

    for (const file of files) {
      const ext = file.basename.toLowerCase().split(".").pop();
      const isVideo = ["mp4", "webm", "mov"].includes(ext || "");
      const isImage = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext || "");

      if (isVideo) {
        await ctx.scheduler.runAfter(0, internal.backgroundMetadata.generateVideoPreview, {
          bookPath,
          fileBasename: file.basename,
        });
        videoCount++;
      } else if (isImage) {
        await ctx.scheduler.runAfter(0, internal.backgroundMetadata.generateImagePreview, {
          bookPath,
          fileBasename: file.basename,
        });
        imageCount++;
      }
    }

    return { scheduledVideos: videoCount, scheduledImages: imageCount };
  },
});
