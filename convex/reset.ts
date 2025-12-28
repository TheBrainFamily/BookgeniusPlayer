import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

const BATCH_SIZE = 100;

export const deleteNotesBatch = mutation({
  args: {},
  returns: v.object({ deletedNotes: v.number(), hasMore: v.boolean() }),
  handler: async (ctx) => {
    const notes = await ctx.db.query("notes").take(BATCH_SIZE);
    for (const note of notes) {
      await ctx.db.delete(note._id);
    }
    return { deletedNotes: notes.length, hasMore: notes.length === BATCH_SIZE };
  },
});

export const deleteVariantsBatch = mutation({
  args: {},
  returns: v.object({ deletedVariants: v.number(), hasMore: v.boolean() }),
  handler: async (ctx) => {
    const variants = await ctx.db.query("variants").take(BATCH_SIZE);
    for (const variant of variants) {
      await ctx.db.delete(variant._id);
    }
    return { deletedVariants: variants.length, hasMore: variants.length === BATCH_SIZE };
  },
});

export const deleteAssetsBatch = mutation({
  args: {},
  returns: v.object({
    deletedFolders: v.number(),
    deletedAssets: v.number(),
    deletedVersions: v.number(),
    deletedEvents: v.number(),
    deletedIntents: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx) => {
    return await ctx.runMutation(components.assetManager.assetManager.deleteDataBatch, {
      batchSize: BATCH_SIZE,
    });
  },
});

export const getBookR2Keys = query({
  args: { bookSlug: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { bookSlug }) => {
    const bookPath = `books/${bookSlug}`;
    return await ctx.runQuery(components.assetManager.assetManager.getR2KeysByPathPrefix, {
      pathPrefix: bookPath,
    });
  },
});

export const getBookDeleteInfo = query({
  args: { bookSlug: v.string() },
  returns: v.object({
    bookPath: v.string(),
    noteCount: v.number(),
    variantCount: v.number(),
    backgroundCueCount: v.number(),
    musicCueCount: v.number(),
    musicMetadataCount: v.number(),
    backgroundMetadataCount: v.number(),
    generationJobCount: v.number(),
  }),
  handler: async (ctx, { bookSlug }) => {
    const bookPath = `books/${bookSlug}`;

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    const variants = await ctx.db
      .query("variants")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    const backgroundCues = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    const musicCues = await ctx.db
      .query("musicCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    const musicMetadata = await ctx.db
      .query("musicFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath))
      .collect();

    const backgroundMetadata = await ctx.db
      .query("backgroundFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath))
      .collect();

    const generationJobs = await ctx.db
      .query("bookGenerationJobs")
      .withIndex("by_bookPath", (q) => q.eq("bookPath", bookPath))
      .collect();

    return {
      bookPath,
      noteCount: notes.length,
      variantCount: variants.length,
      backgroundCueCount: backgroundCues.length,
      musicCueCount: musicCues.length,
      musicMetadataCount: musicMetadata.length,
      backgroundMetadataCount: backgroundMetadata.length,
      generationJobCount: generationJobs.length,
    };
  },
});

export const deleteBookDataBatch = mutation({
  args: { bookSlug: v.string() },
  returns: v.object({
    deletedNotes: v.number(),
    deletedVariants: v.number(),
    deletedBackgroundCues: v.number(),
    deletedMusicCues: v.number(),
    deletedMusicMetadata: v.number(),
    deletedBackgroundMetadata: v.number(),
    deletedGenerationJobs: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, { bookSlug }) => {
    const bookPath = `books/${bookSlug}`;

    let deletedNotes = 0;
    let deletedVariants = 0;
    let deletedBackgroundCues = 0;
    let deletedMusicCues = 0;
    let deletedMusicMetadata = 0;
    let deletedBackgroundMetadata = 0;
    let deletedGenerationJobs = 0;

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .take(BATCH_SIZE);
    for (const note of notes) {
      await ctx.db.delete(note._id);
      deletedNotes++;
    }
    if (notes.length === BATCH_SIZE) {
      return {
        deletedNotes,
        deletedVariants,
        deletedBackgroundCues,
        deletedMusicCues,
        deletedMusicMetadata,
        deletedBackgroundMetadata,
        deletedGenerationJobs,
        hasMore: true,
      };
    }

    const variants = await ctx.db
      .query("variants")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .take(BATCH_SIZE);
    for (const variant of variants) {
      await ctx.db.delete(variant._id);
      deletedVariants++;
    }
    if (variants.length === BATCH_SIZE) {
      return {
        deletedNotes,
        deletedVariants,
        deletedBackgroundCues,
        deletedMusicCues,
        deletedMusicMetadata,
        deletedBackgroundMetadata,
        deletedGenerationJobs,
        hasMore: true,
      };
    }

    const backgroundCues = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .take(BATCH_SIZE);
    for (const cue of backgroundCues) {
      await ctx.db.delete(cue._id);
      deletedBackgroundCues++;
    }
    if (backgroundCues.length === BATCH_SIZE) {
      return {
        deletedNotes,
        deletedVariants,
        deletedBackgroundCues,
        deletedMusicCues,
        deletedMusicMetadata,
        deletedBackgroundMetadata,
        deletedGenerationJobs,
        hasMore: true,
      };
    }

    const musicCues = await ctx.db
      .query("musicCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .take(BATCH_SIZE);
    for (const cue of musicCues) {
      await ctx.db.delete(cue._id);
      deletedMusicCues++;
    }
    if (musicCues.length === BATCH_SIZE) {
      return {
        deletedNotes,
        deletedVariants,
        deletedBackgroundCues,
        deletedMusicCues,
        deletedMusicMetadata,
        deletedBackgroundMetadata,
        deletedGenerationJobs,
        hasMore: true,
      };
    }

    const musicMetadata = await ctx.db
      .query("musicFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath))
      .take(BATCH_SIZE);
    for (const meta of musicMetadata) {
      await ctx.db.delete(meta._id);
      deletedMusicMetadata++;
    }
    if (musicMetadata.length === BATCH_SIZE) {
      return {
        deletedNotes,
        deletedVariants,
        deletedBackgroundCues,
        deletedMusicCues,
        deletedMusicMetadata,
        deletedBackgroundMetadata,
        deletedGenerationJobs,
        hasMore: true,
      };
    }

    const backgroundMetadata = await ctx.db
      .query("backgroundFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath))
      .take(BATCH_SIZE);
    for (const meta of backgroundMetadata) {
      await ctx.db.delete(meta._id);
      deletedBackgroundMetadata++;
    }
    if (backgroundMetadata.length === BATCH_SIZE) {
      return {
        deletedNotes,
        deletedVariants,
        deletedBackgroundCues,
        deletedMusicCues,
        deletedMusicMetadata,
        deletedBackgroundMetadata,
        deletedGenerationJobs,
        hasMore: true,
      };
    }

    const generationJobs = await ctx.db
      .query("bookGenerationJobs")
      .withIndex("by_bookPath", (q) => q.eq("bookPath", bookPath))
      .take(BATCH_SIZE);
    for (const job of generationJobs) {
      await ctx.db.delete(job._id);
      deletedGenerationJobs++;
    }

    return {
      deletedNotes,
      deletedVariants,
      deletedBackgroundCues,
      deletedMusicCues,
      deletedMusicMetadata,
      deletedBackgroundMetadata,
      deletedGenerationJobs,
      hasMore: generationJobs.length === BATCH_SIZE,
    };
  },
});

export const deleteBookAssetsBatch = mutation({
  args: { bookSlug: v.string() },
  returns: v.object({
    deletedFolders: v.number(),
    deletedAssets: v.number(),
    deletedVersions: v.number(),
    deletedEvents: v.number(),
    r2KeysToDelete: v.array(v.string()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, { bookSlug }) => {
    const bookPath = `books/${bookSlug}`;
    return await ctx.runMutation(components.assetManager.assetManager.deleteByPathPrefixBatch, {
      pathPrefix: bookPath,
      batchSize: BATCH_SIZE,
    });
  },
});
