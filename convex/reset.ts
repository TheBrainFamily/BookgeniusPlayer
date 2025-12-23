/**
 * Reset mutations for development.
 * Use with caution - these delete data permanently.
 */

import { mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

const BATCH_SIZE = 100;

/**
 * Delete a batch of notes and variants.
 * Call repeatedly until hasMore is false.
 */
export const deleteNotesBatch = mutation({
  args: {},
  returns: v.object({
    deletedNotes: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx) => {
    const notes = await ctx.db.query("notes").take(BATCH_SIZE);
    for (const note of notes) {
      await ctx.db.delete(note._id);
    }
    return {
      deletedNotes: notes.length,
      hasMore: notes.length === BATCH_SIZE,
    };
  },
});

/**
 * Delete a batch of variants.
 * Call repeatedly until hasMore is false.
 */
export const deleteVariantsBatch = mutation({
  args: {},
  returns: v.object({
    deletedVariants: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx) => {
    const variants = await ctx.db.query("variants").take(BATCH_SIZE);
    for (const variant of variants) {
      await ctx.db.delete(variant._id);
    }
    return {
      deletedVariants: variants.length,
      hasMore: variants.length === BATCH_SIZE,
    };
  },
});

/**
 * Delete a batch of asset-manager data.
 * Wrapper around component's deleteDataBatch.
 */
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
    return await ctx.runMutation(
      components.assetManager.assetManager.deleteDataBatch,
      { batchSize: BATCH_SIZE }
    );
  },
});
