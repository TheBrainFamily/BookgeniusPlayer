// convex/cli.ts
// CLI operations for asset management - admin only for mutations
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { publicQuery, adminMutation, publicAction } from "./functions";

// --- Folder Operations ---

export const listFolders = publicQuery({
  args: { parentPath: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.listFolders, args);
  },
});

export const getFolder = publicQuery({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.getFolder, args);
  },
});

export const createFolderByName = adminMutation({
  args: { parentPath: v.string(), name: v.string(), extra: v.optional(v.any()) },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.createFolderByName, args);
  },
});

export const createFolderByPath = adminMutation({
  args: { path: v.string(), name: v.optional(v.string()), extra: v.optional(v.any()) },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.createFolderByPath, args);
  },
});

export const updateFolder = adminMutation({
  args: { path: v.string(), name: v.optional(v.string()), extra: v.optional(v.any()) },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.updateFolder, args);
  },
});

// --- Asset Operations ---

export const listAssets = publicQuery({
  args: { folderPath: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.listAssets, args);
  },
});

export const getAsset = publicQuery({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.getAsset, args);
  },
});

export const createAsset = adminMutation({
  args: { folderPath: v.string(), basename: v.string(), extra: v.optional(v.any()) },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.createAsset, args);
  },
});

export const renameAsset = adminMutation({
  args: { folderPath: v.string(), basename: v.string(), newBasename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.renameAsset, args);
  },
});

// --- Version Operations ---

export const getAssetVersions = publicQuery({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, args);
  },
});

export const getPublishedFile = publicQuery({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.getPublishedFile, args);
  },
});

export const listPublishedFilesInFolder = publicQuery({
  args: { folderPath: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      args,
    );
  },
});

export const publishDraft = adminMutation({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(components.assetManager.assetManager.publishDraft, args);
    if (args.folderPath.endsWith("/chapters")) {
      const bookPath = args.folderPath.replace(/\/chapters$/, "");
      await ctx.scheduler.runAfter(0, internal.chapterCompiler.processPublishedChapter, {
        bookPath,
        chapterBasename: args.basename,
        versionId: result.versionId,
      });
    }
    return result;
  },
});

/**
 * Backfill compiled chapter HTML and character fragments for a book.
 */
export const backfillCompiledChapters = adminMutation({
  args: { bookPath: v.string() },
  handler: async (ctx, args) => {
    const chapters = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${args.bookPath}/chapters` },
    );

    for (const chapter of chapters) {
      await ctx.scheduler.runAfter(0, internal.chapterCompiler.processPublishedChapter, {
        bookPath: args.bookPath,
        chapterBasename: chapter.basename,
        versionId: chapter.versionId,
      });
    }

    return { scheduled: chapters.length };
  },
});

export const restoreVersion = adminMutation({
  args: { versionId: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.restoreVersion, args);
  },
});

export const updateVersionExtra = adminMutation({
  args: { versionId: v.string(), extra: v.any() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.updateVersionExtra, {
      versionId: args.versionId,
      extra: args.extra,
    });
  },
});

// --- Admin Preview (any version state) ---

export const getVersionPreviewUrl = publicQuery({
  args: { versionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetFsHttp.getVersionPreviewUrl, args);
  },
});

// --- Text Content Fetching (bypasses CORS for text files) ---

export const getTextContent = publicAction({
  args: { versionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runAction(components.assetManager.assetFsHttp.getTextContent, {
      versionId: args.versionId,
    });
  },
});
