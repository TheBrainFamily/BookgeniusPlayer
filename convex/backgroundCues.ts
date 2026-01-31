/**
 * Background Cues - Links background video/image files to chapter/paragraph positions
 *
 * Cues define when a background asset should play. One file can have multiple cue points
 * (e.g., castle.mp4 at ch1-p0 AND ch3-p20). Files live in backgrounds/ folder.
 */

import { v } from "convex/values";
import { publicQuery, bookMutation, internalMutation } from "./functions";
import { components } from "./_generated/api";

// =============================================================================
// Queries
// =============================================================================

/**
 * List all background cues for a book, with file URLs and preview thumbnails.
 * Sorted by chapter, then paragraph.
 */
export const listByBook = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const cues = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    // Get file URLs from asset-manager
    const files = await ctx.runQuery(
      components.versionedAssets.assetManager.listPublishedFilesInFolder,
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
      components.versionedAssets.assetManager.listPublishedFilesInFolder,
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
export const listForPlayer = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const cues = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    // Get file URLs from asset-manager
    const files = await ctx.runQuery(
      components.versionedAssets.assetManager.listPublishedFilesInFolder,
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
 * Get available background files (for picker UI).
 * Includes preview URLs for thumbnails.
 */
export const listFiles = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const files = await ctx.runQuery(
      components.versionedAssets.assetManager.listPublishedFilesInFolder,
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
      components.versionedAssets.assetManager.listPublishedFilesInFolder,
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
export const countByBook = publicQuery({
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
export const create = bookMutation({
  args: {
    fileBasename: v.string(),
    chapter: v.number(),
    paragraph: v.number(),
    backgroundColor: v.optional(v.string()),
    textColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // bookDb.insert auto-adds bookPath
    return await ctx.bookDb.insert("backgroundCues", args);
  },
});

/**
 * Update a cue's position.
 */
export const updatePosition = bookMutation({
  args: { id: v.id("backgroundCues"), chapter: v.number(), paragraph: v.number() },
  handler: async (ctx, { id, chapter, paragraph }) => {
    return await ctx.bookDb.patch(id, { chapter, paragraph });
  },
});

/**
 * Update a cue's file.
 */
export const updateFile = bookMutation({
  args: { id: v.id("backgroundCues"), fileBasename: v.string() },
  handler: async (ctx, { id, fileBasename }) => {
    return await ctx.bookDb.patch(id, { fileBasename });
  },
});

/**
 * Update all cues that reference a specific file.
 */
export const updateFileForBasename = bookMutation({
  args: { oldBasename: v.string(), newBasename: v.string() },
  handler: async (ctx, { oldBasename, newBasename }) => {
    const cues = await ctx.bookDb
      .query("backgroundCues")
      .filter((q) => q.eq(q.field("fileBasename"), oldBasename))
      .collect();

    for (const cue of cues) {
      await ctx.bookDb.patch(cue._id, { fileBasename: newBasename });
    }

    return { updated: cues.length };
  },
});

/**
 * Update a cue's colors.
 */
export const updateColors = bookMutation({
  args: {
    id: v.id("backgroundCues"),
    backgroundColor: v.optional(v.string()),
    textColor: v.optional(v.string()),
  },
  handler: async (ctx, { id, backgroundColor, textColor }) => {
    return await ctx.bookDb.patch(id, { backgroundColor, textColor });
  },
});

/**
 * Delete a cue.
 */
export const remove = bookMutation({
  args: { id: v.id("backgroundCues") },
  handler: async (ctx, { id }) => {
    return await ctx.bookDb.delete(id);
  },
});

/**
 * Bulk create cues (for import).
 */
export const bulkCreate = bookMutation({
  args: {
    cues: v.array(
      v.object({
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
      // bookDb.insert auto-adds bookPath
      const id = await ctx.bookDb.insert("backgroundCues", cue);
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Delete all cues for a book (for re-import).
 */
export const deleteAllForBook = bookMutation({
  args: {},
  handler: async (ctx) => {
    // bookDb.query auto-filters by bookPath
    const cues = await ctx.bookDb.query("backgroundCues").collect();

    for (const cue of cues) {
      await ctx.bookDb.delete(cue._id);
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

export const updateColorsForFileInternal = internalMutation({
  args: {
    bookPath: v.string(),
    fileBasename: v.string(),
    backgroundColor: v.string(),
    textColor: v.string(),
  },
  handler: async (ctx, { bookPath, fileBasename, backgroundColor, textColor }) => {
    const cues = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    const matchingCues = cues.filter((c) => c.fileBasename === fileBasename);
    let updatedCount = 0;

    for (const cue of matchingCues) {
      if (!cue.backgroundColor) {
        await ctx.db.patch(cue._id, { backgroundColor, textColor });
        updatedCount++;
      }
    }

    return { total: matchingCues.length, updated: updatedCount };
  },
});
