// convex/cli.ts
import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
// Import the registered components entry point
import { components, internal } from "./_generated/api";
import { requireAuth } from "./authHelpers";

// --- Folder Operations ---

export const listFolders = query({
  args: { parentPath: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.listFolders, args);
  },
});

export const getFolder = query({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.getFolder, args);
  },
});

export const createFolderByName = mutation({
  args: { parentPath: v.string(), name: v.string(), extra: v.optional(v.any()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.runMutation(components.assetManager.assetManager.createFolderByName, args);
  },
});

export const createFolderByPath = mutation({
  args: { path: v.string(), name: v.optional(v.string()), extra: v.optional(v.any()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.runMutation(components.assetManager.assetManager.createFolderByPath, args);
  },
});

export const updateFolder = mutation({
  args: { path: v.string(), name: v.optional(v.string()), extra: v.optional(v.any()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.runMutation(components.assetManager.assetManager.updateFolder, args);
  },
});

// --- Asset Operations ---

export const listAssets = query({
  args: { folderPath: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.listAssets, args);
  },
});

export const getAsset = query({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.getAsset, args);
  },
});

export const createAsset = mutation({
  args: { folderPath: v.string(), basename: v.string(), extra: v.optional(v.any()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.runMutation(components.assetManager.assetManager.createAsset, args);
  },
});

export const renameAsset = mutation({
  args: { folderPath: v.string(), basename: v.string(), newBasename: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.runMutation(components.assetManager.assetManager.renameAsset, args);
  },
});

// --- Version Operations ---

export const getAssetVersions = query({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, args);
  },
});

export const getPublishedFile = query({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetManager.getPublishedFile, args);
  },
});

export const listPublishedFilesInFolder = query({
  args: { folderPath: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      args,
    );
  },
});

export const publishDraft = mutation({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
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
export const backfillCompiledChapters = mutation({
  args: { bookPath: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

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

export const restoreVersion = mutation({
  args: { versionId: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.runMutation(components.assetManager.assetManager.restoreVersion, args);
  },
});

export const updateVersionExtra = mutation({
  args: { versionId: v.string(), extra: v.any() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.runMutation(components.assetManager.assetManager.updateVersionExtra, {
      versionId: args.versionId,
      extra: args.extra,
    });
  },
});

// --- Admin Preview (any version state) ---

export const getVersionPreviewUrl = query({
  args: { versionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.assetManager.assetFsHttp.getVersionPreviewUrl, args);
  },
});

// --- Text Content Fetching (bypasses CORS for text files) ---

export const getTextContent = action({
  args: { versionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runAction(components.assetManager.assetFsHttp.getTextContent, {
      versionId: args.versionId,
    });
  },
});
