// convex/importHelpers.ts
// Helpers for import scripts and generator pipeline
// All mutations require admin access

import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { adminMutation } from "./functions";

function getR2Config() {
  if (!process.env.R2_BUCKET) return undefined;
  return {
    R2_BUCKET: process.env.R2_BUCKET,
    R2_ENDPOINT: process.env.R2_ENDPOINT!,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
  };
}

const storageBackendValidator = v.union(v.literal("convex"), v.literal("r2"));

/**
 * Start an upload for import - ADMIN ONLY.
 * Returns intentId + uploadUrl for the intent-based flow.
 */
export const startUpload = adminMutation({
  args: { folderPath: v.string(), basename: v.string(), label: v.optional(v.string()) },
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
 * Finish an upload for import - ADMIN ONLY.
 */
export const finishUpload = adminMutation({
  args: {
    intentId: v.string(),
    storageId: v.optional(v.id("_storage")),
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

    if (args.folderPath?.endsWith("/chapters") && args.basename) {
      const bookPath = args.folderPath.replace(/\/chapters$/, "");
      await ctx.scheduler.runAfter(0, internal.chapterCompiler.processPublishedChapter, {
        bookPath,
        chapterBasename: args.basename,
        versionId: result.versionId,
      });
    }

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

    if (args.folderPath?.includes("/characters/") && args.basename?.startsWith("avatar-large.")) {
      await ctx.scheduler.runAfter(2000, internal.avatarGeneration.processUploadedAvatarLarge, {
        characterPath: args.folderPath,
      });
    }

    return result;
  },
});

/**
 * Create version from storage ID for migrations - ADMIN ONLY.
 * Use this for copying files by reference without re-uploading.
 */
export const createVersionFromStorageId = adminMutation({
  args: {
    folderPath: v.string(),
    basename: v.string(),
    storageId: v.id("_storage"),
    label: v.optional(v.string()),
  },
  returns: v.object({ assetId: v.string(), versionId: v.string(), version: v.number() }),
  handler: async (ctx, args) => {
    return await ctx.runMutation(
      components.assetManager.assetManager.createVersionFromStorageId,
      args,
    );
  },
});

/**
 * Create folder by path - ADMIN ONLY.
 */
export const createFolderByPath = adminMutation({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.createFolderByPath, args);
  },
});
