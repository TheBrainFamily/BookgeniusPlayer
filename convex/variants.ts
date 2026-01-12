/**
 * Variants - Sentence simplifications for books
 *
 * Variants provide alternative versions of sentences at different reading levels.
 * Each variant has a variantId (e.g., "ch1-p9-s1") that encodes its location.
 * The chapter number is extracted from the ID for efficient per-chapter queries.
 */

import { v } from "convex/values";
import { publicQuery, bookMutation } from "./functions";

// Simplification type for reuse
const simplificationValidator = v.object({ score: v.number(), sentences: v.array(v.string()) });

// =============================================================================
// Queries
// =============================================================================

/**
 * List all variants for a book.
 * Returns simplified format for player consumption.
 */
export const listByBook = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return variants.map((v) => ({ id: v.variantId, simplifications: v.simplifications }));
  },
});

/**
 * List variants for a specific chapter.
 * Used for per-chapter loading in sliding window pattern.
 */
export const listByChapter = publicQuery({
  args: { bookPath: v.string(), chapter: v.number() },
  handler: async (ctx, { bookPath, chapter }) => {
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_book_chapter", (q) => q.eq("bookPath", bookPath).eq("chapter", chapter))
      .collect();

    return variants.map((v) => ({ id: v.variantId, simplifications: v.simplifications }));
  },
});

/**
 * List variants for a range of chapters.
 * Useful for preloading adjacent chapters.
 */
export const listByChapterRange = publicQuery({
  args: { bookPath: v.string(), fromChapter: v.number(), toChapter: v.number() },
  handler: async (ctx, { bookPath, fromChapter, toChapter }) => {
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .filter((q) =>
        q.and(q.gte(q.field("chapter"), fromChapter), q.lte(q.field("chapter"), toChapter)),
      )
      .collect();

    return variants.map((v) => ({
      id: v.variantId,
      simplifications: v.simplifications,
      chapter: v.chapter,
    }));
  },
});

/**
 * Get a single variant by ID.
 */
export const getByVariantId = publicQuery({
  args: { bookPath: v.string(), variantId: v.string() },
  handler: async (ctx, { bookPath, variantId }) => {
    const variant = await ctx.db
      .query("variants")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .filter((q) => q.eq(q.field("variantId"), variantId))
      .first();

    if (!variant) return null;

    return {
      id: variant.variantId,
      simplifications: variant.simplifications,
      chapter: variant.chapter,
    };
  },
});

/**
 * Count variants for a book.
 * Used for dashboard stats.
 */
export const countByBook = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return variants.length;
  },
});

// =============================================================================
// Mutations
// =============================================================================

/**
 * Create a new variant.
 */
export const create = bookMutation({
  args: {
    variantId: v.string(),
    chapter: v.number(),
    simplifications: v.array(simplificationValidator),
  },
  handler: async (ctx, args) => {
    return await ctx.bookDb.insert("variants", args);
  },
});

/**
 * Update a variant's simplifications.
 */
export const update = bookMutation({
  args: { id: v.id("variants"), simplifications: v.array(simplificationValidator) },
  handler: async (ctx, { id, simplifications }) => {
    return await ctx.bookDb.patch(id, { simplifications });
  },
});

/**
 * Add a simplification level to a variant.
 */
export const addSimplification = bookMutation({
  args: { id: v.id("variants"), simplification: simplificationValidator },
  handler: async (ctx, { id, simplification }) => {
    const variant = await ctx.bookDb.get(id);
    if (!variant) throw new Error("Variant not found");

    const updated = [...variant.simplifications, simplification];
    // Sort by score descending (higher = more complex)
    updated.sort((a, b) => b.score - a.score);

    return await ctx.bookDb.patch(id, { simplifications: updated });
  },
});

/**
 * Remove a simplification level from a variant by score.
 */
export const removeSimplification = bookMutation({
  args: { id: v.id("variants"), score: v.number() },
  handler: async (ctx, { id, score }) => {
    const variant = await ctx.bookDb.get(id);
    if (!variant) throw new Error("Variant not found");

    const updated = variant.simplifications.filter((s) => s.score !== score);
    return await ctx.bookDb.patch(id, { simplifications: updated });
  },
});

/**
 * Delete a variant.
 */
export const remove = bookMutation({
  args: { id: v.id("variants") },
  handler: async (ctx, { id }) => {
    return await ctx.bookDb.delete(id);
  },
});

/**
 * Bulk create variants (for import).
 */
export const bulkCreate = bookMutation({
  args: {
    variants: v.array(
      v.object({
        variantId: v.string(),
        chapter: v.number(),
        simplifications: v.array(simplificationValidator),
      }),
    ),
  },
  handler: async (ctx, { variants }) => {
    const ids = [];
    for (const variant of variants) {
      const id = await ctx.bookDb.insert("variants", variant);
      ids.push(id);
    }
    return ids;
  },
});
