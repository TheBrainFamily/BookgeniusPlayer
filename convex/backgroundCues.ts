/**
 * Background Cues - Links background video/image files to chapter/paragraph positions
 *
 * Cues define when a background asset should play. One file can have multiple cue points
 * (e.g., castle.mp4 at ch1-p0 AND ch3-p20). Files live in backgrounds/ folder.
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { components } from "./_generated/api";

// =============================================================================
// Queries
// =============================================================================

/**
 * List all background cues for a book, with file URLs and preview thumbnails.
 * Sorted by chapter, then paragraph.
 */
export const listByBook = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const cues = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    // Get file URLs from asset-manager
    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/backgrounds` },
    );

    const fileMap = new Map(files.map((f) => [f.basename, f.url]));

    // Get preview metadata
    const allMetadata = await ctx.db
      .query("backgroundFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath))
      .collect();
    const metadataMap = new Map(allMetadata.map((m) => [m.fileBasename, m]));

    // Get preview file URLs
    const previewFiles = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/background-thumbnails` },
    );
    const previewMap = new Map(previewFiles.map((f) => [f.basename, f.url]));

    return cues
      .map((cue) => {
        const meta = metadataMap.get(cue.fileBasename);
        return {
          _id: cue._id,
          fileBasename: cue.fileBasename,
          chapter: cue.chapter,
          paragraph: cue.paragraph,
          backgroundColor: cue.backgroundColor,
          textColor: cue.textColor,
          url: fileMap.get(cue.fileBasename),
          previewMp4Url: meta?.previewMp4Basename
            ? previewMap.get(meta.previewMp4Basename)
            : undefined,
          previewWebpUrl: meta?.previewWebpBasename
            ? previewMap.get(meta.previewWebpBasename)
            : undefined,
          previewStatus: meta?.status,
        };
      })
      .sort((a, b) =>
        a.chapter !== b.chapter ? a.chapter - b.chapter : a.paragraph - b.paragraph,
      );
  },
});

/**
 * List cues in player format (matches existing backgroundsForBook shape).
 * For backwards compatibility with player.
 */
export const listForPlayer = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const cues = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    // Get file URLs from asset-manager
    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/backgrounds` },
    );

    const fileMap = new Map(files.map((f) => [f.basename, f.url]));

    return cues
      .map((cue) => ({
        startChapter: cue.chapter,
        startParagraph: cue.paragraph,
        file: cue.fileBasename,
        url: fileMap.get(cue.fileBasename),
        backgroundColor: cue.backgroundColor,
        textColor: cue.textColor,
      }))
      .sort((a, b) =>
        a.startChapter !== b.startChapter
          ? a.startChapter - b.startChapter
          : a.startParagraph - b.startParagraph,
      );
  },
});

/**
 * List cues in player format, preferring draft files over published.
 * For live edit mode.
 */
export const listForPlayerWithDrafts = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const cues = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    const backgroundsPath = `${bookPath}/backgrounds`;

    // Get all assets (not just published)
    const assets = await ctx.runQuery(components.assetManager.assetManager.listAssets, {
      folderPath: backgroundsPath,
    });

    // Build fileBasename -> url map, preferring drafts
    const fileMap = new Map<string, string>();

    for (const asset of assets) {
      const versions = await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, {
        folderPath: backgroundsPath,
        basename: asset.basename,
      });

      const draftVersion = versions.find((v) => v.state === "draft");
      const publishedVersion = versions.find((v) => v.state === "published");
      const bestVersion = draftVersion || publishedVersion || versions[0];

      if (bestVersion) {
        const urlInfo = await ctx.runQuery(
          components.assetManager.assetFsHttp.getVersionPreviewUrl,
          { versionId: bestVersion._id },
        );
        if (urlInfo?.url) {
          fileMap.set(asset.basename, urlInfo.url);
        }
      }
    }

    return cues
      .filter((cue) => fileMap.has(cue.fileBasename))
      .map((cue) => ({
        startChapter: cue.chapter,
        startParagraph: cue.paragraph,
        file: cue.fileBasename,
        url: fileMap.get(cue.fileBasename),
        backgroundColor: cue.backgroundColor,
        textColor: cue.textColor,
      }))
      .sort((a, b) =>
        a.startChapter !== b.startChapter
          ? a.startChapter - b.startChapter
          : a.startParagraph - b.startParagraph,
      );
  },
});

/**
 * Get available background files (for picker UI).
 * Includes preview URLs for thumbnails.
 */
export const listFiles = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/backgrounds` },
    );

    // Get preview metadata for all files
    const allMetadata = await ctx.db
      .query("backgroundFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath))
      .collect();
    const metadataMap = new Map(allMetadata.map((m) => [m.fileBasename, m]));

    // Get preview file URLs
    const previewFiles = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/background-thumbnails` },
    );
    const previewMap = new Map(previewFiles.map((f) => [f.basename, f.url]));

    return files.map((f) => {
      const meta = metadataMap.get(f.basename);
      return {
        basename: f.basename,
        url: f.url,
        contentType: f.contentType,
        previewMp4Url: meta?.previewMp4Basename
          ? previewMap.get(meta.previewMp4Basename)
          : undefined,
        previewWebpUrl: meta?.previewWebpBasename
          ? previewMap.get(meta.previewWebpBasename)
          : undefined,
        previewStatus: meta?.status,
      };
    });
  },
});

/**
 * Count cues for a book.
 */
export const countByBook = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const cues = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return cues.length;
  },
});

// =============================================================================
// Mutations
// =============================================================================

/**
 * Create a new cue point.
 */
export const create = mutation({
  args: {
    bookPath: v.string(),
    fileBasename: v.string(),
    chapter: v.number(),
    paragraph: v.number(),
    backgroundColor: v.optional(v.string()),
    textColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("backgroundCues", args);
  },
});

/**
 * Update a cue's position.
 */
export const updatePosition = mutation({
  args: { id: v.id("backgroundCues"), chapter: v.number(), paragraph: v.number() },
  handler: async (ctx, { id, chapter, paragraph }) => {
    return await ctx.db.patch(id, { chapter, paragraph });
  },
});

/**
 * Update a cue's file.
 */
export const updateFile = mutation({
  args: { id: v.id("backgroundCues"), fileBasename: v.string() },
  handler: async (ctx, { id, fileBasename }) => {
    return await ctx.db.patch(id, { fileBasename });
  },
});

/**
 * Update a cue's colors.
 */
export const updateColors = mutation({
  args: {
    id: v.id("backgroundCues"),
    backgroundColor: v.optional(v.string()),
    textColor: v.optional(v.string()),
  },
  handler: async (ctx, { id, backgroundColor, textColor }) => {
    return await ctx.db.patch(id, { backgroundColor, textColor });
  },
});

/**
 * Delete a cue.
 */
export const remove = mutation({
  args: { id: v.id("backgroundCues") },
  handler: async (ctx, { id }) => {
    return await ctx.db.delete(id);
  },
});

/**
 * Bulk create cues (for import).
 */
export const bulkCreate = mutation({
  args: {
    cues: v.array(
      v.object({
        bookPath: v.string(),
        fileBasename: v.string(),
        chapter: v.number(),
        paragraph: v.number(),
        backgroundColor: v.optional(v.string()),
        textColor: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { cues }) => {
    const ids = [];
    for (const cue of cues) {
      const id = await ctx.db.insert("backgroundCues", cue);
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Delete all cues for a book (for re-import).
 */
export const deleteAllForBook = mutation({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const cues = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    for (const cue of cues) {
      await ctx.db.delete(cue._id);
    }

    return cues.length;
  },
});

// =============================================================================
// Internal Mutations (for use by actions)
// =============================================================================

export const createInternal = internalMutation({
  args: {
    bookPath: v.string(),
    fileBasename: v.string(),
    chapter: v.number(),
    paragraph: v.number(),
    backgroundColor: v.optional(v.string()),
    textColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("backgroundCues", args);
  },
});

export const updateFileInternal = internalMutation({
  args: { id: v.id("backgroundCues"), fileBasename: v.string() },
  handler: async (ctx, { id, fileBasename }) => {
    return await ctx.db.patch(id, { fileBasename });
  },
});
