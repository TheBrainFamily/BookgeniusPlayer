// convex/cli.ts
// CLI operations for asset management - admin only
import { v } from "convex/values";
import { components } from "./_generated/api";
import { adminQuery, adminMutation, adminAction } from "./functions";

// --- Folder Operations ---

export const listFolders = adminQuery({
  args: { parentPath: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.versionedAssets.assetManager.listFolders, args);
  },
});

export const listAllFolders = adminQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.runQuery(components.versionedAssets.assetManager.listAllFolders, {});
  },
});

export const getFolder = adminQuery({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.versionedAssets.assetManager.getFolder, args);
  },
});

export const createFolderByName = adminMutation({
  args: { parentPath: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.versionedAssets.assetManager.createFolderByName, args);
  },
});

export const createFolderByPath = adminMutation({
  args: { path: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.versionedAssets.assetManager.createFolderByPath, args);
  },
});

export const updateFolder = adminMutation({
  args: { path: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.versionedAssets.assetManager.updateFolder, args);
  },
});

// --- Asset Operations ---

export const listAssets = adminQuery({
  args: { folderPath: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.versionedAssets.assetManager.listAssets, args);
  },
});

export const getAsset = adminQuery({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.versionedAssets.assetManager.getAsset, args);
  },
});

export const createAsset = adminMutation({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.versionedAssets.assetManager.createAsset, args);
  },
});

export const renameAsset = adminMutation({
  args: { folderPath: v.string(), basename: v.string(), newBasename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.versionedAssets.assetManager.renameAsset, args);
  },
});

// --- Version Operations ---

export const getAssetVersions = adminQuery({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.versionedAssets.assetManager.getAssetVersions, args);
  },
});

export const getPublishedFile = adminQuery({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.versionedAssets.assetManager.getPublishedFile, args);
  },
});

export const listPublishedFilesInFolder = adminQuery({
  args: { folderPath: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(
      components.versionedAssets.assetManager.listPublishedFilesInFolder,
      args,
    );
  },
});

export const restoreVersion = adminMutation({
  args: { versionId: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.versionedAssets.assetManager.restoreVersion, args);
  },
});

// --- Admin Preview (any version state) ---

export const getVersionPreviewUrl = adminQuery({
  args: { versionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.versionedAssets.assetFsHttp.getVersionPreviewUrl, args);
  },
});

// --- Text Content Fetching (bypasses CORS for text files) ---

export const getTextContent = adminAction({
  args: { versionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runAction(components.versionedAssets.assetFsHttp.getTextContent, {
      versionId: args.versionId,
    });
  },
});

// --- Changelog Operations (for real-time sync) ---

/**
 * Compound cursor for reliable pagination (flat args for ConvexMobile SDK compatibility).
 * Uses cursorCreatedAt + cursorId to avoid skipping items with identical timestamps.
 * For initial fetch, use cursorCreatedAt: 0, cursorId: ""
 */
export const watchChangelog = adminQuery({
  args: { cursorCreatedAt: v.number(), cursorId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cursor = { createdAt: args.cursorCreatedAt, id: args.cursorId };
    return await ctx.runQuery(components.versionedAssets.changelog.listSince, {
      cursor,
      limit: args.limit,
    });
  },
});

export const watchFolderChanges = adminQuery({
  args: {
    folderPath: v.string(),
    cursorCreatedAt: v.number(),
    cursorId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cursor = { createdAt: args.cursorCreatedAt, id: args.cursorId };
    return await ctx.runQuery(components.versionedAssets.changelog.listForFolder, {
      folderPath: args.folderPath,
      cursor,
      limit: args.limit,
    });
  },
});
