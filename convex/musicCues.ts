/**
 * Music Cues - Links music files to chapter/paragraph positions
 *
 * Cues define when a music track should play. One file can have multiple cue points.
 * Files live in music/ folder.
 */

import { v } from "convex/values";
import { publicQuery, bookMutation } from "./functions";
import { components } from "./_generated/api";

// =============================================================================
// Queries
// =============================================================================

/**
 * List all music cues for a book, with file URLs and cover art.
 * Sorted by chapter, then paragraph.
 */
export const listByBook = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const cues = await ctx.db
      .query("musicCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    // Get file URLs from asset-manager
    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/music` },
    );
    const fileMap = new Map(files.map((f) => [f.basename, f.url]));

    // Get metadata with cover info
    const allMetadata = await ctx.db
      .query("musicFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath))
      .collect();
    const metadataMap = new Map(allMetadata.map((m) => [m.fileBasename, m]));

    // Get cover URLs
    const coverFiles = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/music-covers` },
    );
    const coverMap = new Map(coverFiles.map((f) => [f.basename, f.url]));

    return cues
      .map((cue) => {
        const metadata = metadataMap.get(cue.fileBasename);
        return {
          _id: cue._id,
          fileBasename: cue.fileBasename,
          chapter: cue.chapter,
          paragraph: cue.paragraph,
          order: cue.order ?? 0,
          url: fileMap.get(cue.fileBasename),
          coverUrl: metadata?.coverBasename ? coverMap.get(metadata.coverBasename) : undefined,
          title: metadata?.title,
          artist: metadata?.artist,
        };
      })
      .sort((a, b) => {
        // Sort by chapter, then paragraph, then order within group
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        if (a.paragraph !== b.paragraph) return a.paragraph - b.paragraph;
        return a.order - b.order;
      });
  },
});

/**
 * List cues in player format (matches existing backgroundSongsForBook shape).
 * For backwards compatibility with player.
 */
export const listForPlayer = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const cues = await ctx.db
      .query("musicCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    // Get file URLs from asset-manager
    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/music` },
    );

    const fileMap = new Map(files.map((f) => [f.basename, f.url]));

    return cues
      .filter((cue) => fileMap.has(cue.fileBasename))
      .map((cue) => ({
        chapter: cue.chapter,
        paragraph: cue.paragraph,
        files: [fileMap.get(cue.fileBasename)!],
      }))
      .sort((a, b) =>
        a.chapter !== b.chapter ? a.chapter - b.chapter : a.paragraph - b.paragraph,
      );
  },
});

/**
 * Get available music files (for picker UI).
 * Includes cover art URLs from extracted metadata.
 */
export const listFiles = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/music` },
    );

    // Get metadata with cover info
    const allMetadata = await ctx.db
      .query("musicFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath))
      .collect();
    const metadataMap = new Map(allMetadata.map((m) => [m.fileBasename, m]));

    // Get cover URLs
    const coverFiles = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/music-covers` },
    );
    const coverMap = new Map(coverFiles.map((f) => [f.basename, f.url]));

    return files.map((f) => {
      const metadata = metadataMap.get(f.basename);
      return {
        basename: f.basename,
        url: f.url,
        contentType: f.contentType,
        coverUrl: metadata?.coverBasename ? coverMap.get(metadata.coverBasename) : undefined,
        title: metadata?.title,
        artist: metadata?.artist,
        duration: metadata?.duration,
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
      .query("musicCues")
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
 * Automatically assigns order to be last in the chapter/paragraph group.
 */
export const create = bookMutation({
  args: { fileBasename: v.string(), chapter: v.number(), paragraph: v.number() },
  handler: async (ctx, args) => {
    console.log("[musicCues.create] Creating music cue", { ...args, bookPath: ctx.bookPath });

    // Query existing cues to determine order
    const existingCues = await ctx.bookDb
      .query("musicCues")
      .filter((q) =>
        q.and(q.eq(q.field("chapter"), args.chapter), q.eq(q.field("paragraph"), args.paragraph)),
      )
      .collect();

    const maxOrder = existingCues.reduce(
      (max: number, cue: { order?: number }) => Math.max(max, cue.order ?? 0),
      -1,
    );
    const order = maxOrder + 1;

    console.log("[musicCues.create] Inserting with order", {
      order,
      existingCount: existingCues.length,
    });
    // bookDb.insert auto-adds bookPath
    const id = await ctx.bookDb.insert("musicCues", { ...args, order });
    console.log("[musicCues.create] Created cue with id", id);

    return id;
  },
});

/**
 * Update a cue's position.
 */
export const updatePosition = bookMutation({
  args: { id: v.id("musicCues"), chapter: v.number(), paragraph: v.number() },
  handler: async (ctx, { id, chapter, paragraph }) => {
    return await ctx.bookDb.patch(id, { chapter, paragraph });
  },
});

/**
 * Update a cue's file.
 */
export const updateFile = bookMutation({
  args: { id: v.id("musicCues"), fileBasename: v.string() },
  handler: async (ctx, { id, fileBasename }) => {
    console.log("[musicCues.updateFile] Updating cue file", { id, fileBasename });

    // bookDb.get auto-verifies record belongs to this book
    const existingCue = await ctx.bookDb.get(id);
    if (!existingCue) {
      console.error("[musicCues.updateFile] Cue not found", { id });
      throw new Error(`Music cue not found: ${id}`);
    }

    console.log("[musicCues.updateFile] Found existing cue", {
      oldFileBasename: existingCue.fileBasename,
      chapter: existingCue.chapter,
      paragraph: existingCue.paragraph,
    });

    await ctx.bookDb.patch(id, { fileBasename });
    console.log("[musicCues.updateFile] Updated successfully");

    return id;
  },
});

/**
 * Reorder cues within the same chapter/paragraph group.
 * Takes an array of cue IDs in the new order.
 */
export const reorder = bookMutation({
  args: { cueIds: v.array(v.id("musicCues")) },
  handler: async (ctx, { cueIds }) => {
    // Update each cue's order based on its position in the array
    for (let i = 0; i < cueIds.length; i++) {
      // bookDb.patch auto-verifies each record belongs to this book
      await ctx.bookDb.patch(cueIds[i], { order: i });
    }
  },
});

/**
 * Delete a cue.
 */
export const remove = bookMutation({
  args: { id: v.id("musicCues") },
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
      v.object({ fileBasename: v.string(), chapter: v.number(), paragraph: v.number() }),
    ),
  },
  handler: async (ctx, { cues }) => {
    const ids = [];
    for (const cue of cues) {
      // bookDb.insert auto-adds bookPath
      const id = await ctx.bookDb.insert("musicCues", cue);
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
    const cues = await ctx.bookDb.query("musicCues").collect();

    for (const cue of cues) {
      await ctx.bookDb.delete(cue._id);
    }

    return cues.length;
  },
});
