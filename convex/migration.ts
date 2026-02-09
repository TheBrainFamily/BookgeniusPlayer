/**
 * Migration queries - helper queries for data migrations
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Find all books that have cues at paragraph > 0.
 * Returns book paths with counts of affected cues.
 */
export const findBooksWithNonZeroParagraphCues = query({
  args: {},
  handler: async (ctx) => {
    // Get all background cues
    const backgroundCues = await ctx.db.query("backgroundCues").collect();

    // Get all music cues
    const musicCues = await ctx.db.query("musicCues").collect();

    // Combine and filter for paragraph > 0
    const allCues = [...backgroundCues, ...musicCues];
    const nonZeroCues = allCues.filter(cue => cue.paragraph > 0);

    // Group by book
    const byBook = new Map<string, { backgrounds: number; music: number; totalCues: number }>();

    for (const cue of nonZeroCues) {
      const existing = byBook.get(cue.bookPath) || { backgrounds: 0, music: 0, totalCues: 0 };

      if ('backgroundColor' in cue) {
        existing.backgrounds++;
      } else {
        existing.music++;
      }
      existing.totalCues++;

      byBook.set(cue.bookPath, existing);
    }

    // Convert to array and sort by total cues descending
    return Array.from(byBook.entries())
      .map(([bookPath, counts]) => ({ bookPath, ...counts }))
      .sort((a, b) => b.totalCues - a.totalCues);
  },
});

/**
 * Get all cues for a specific book (for snapshot backup)
 */
export const getAllCuesForBook = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const backgroundCues = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    const musicCues = await ctx.db
      .query("musicCues")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return {
      bookPath,
      backgroundCues: backgroundCues.map(c => ({
        _id: c._id,
        chapter: c.chapter,
        paragraph: c.paragraph,
        fileBasename: c.fileBasename,
        backgroundColor: c.backgroundColor,
        textColor: c.textColor,
      })),
      musicCues: musicCues.map(c => ({
        _id: c._id,
        chapter: c.chapter,
        paragraph: c.paragraph,
        fileBasename: c.fileBasename,
        order: c.order,
      })),
      timestamp: Date.now(),
    };
  },
});

/**
 * Bulk update paragraph indices for cues (for migration).
 * Updates are provided as array of { _id, newParagraph }.
 *
 * Note: This is a privileged operation - only use for migrations.
 */
export const bulkUpdateCueParagraphs = mutation({
  args: {
    updates: v.array(
      v.object({
        _id: v.string(),
        type: v.union(v.literal("background"), v.literal("music")),
        newParagraph: v.number(),
      })
    ),
  },
  handler: async (ctx, { updates }) => {
    const results = { updated: 0, failed: 0 };

    for (const update of updates) {
      try {
        // Get the ID properly typed
        const id = update._id as any;

        // Update the cue
        await ctx.db.patch(id, { paragraph: update.newParagraph });
        results.updated++;
      } catch (err) {
        console.error(`Failed to update ${update._id}:`, err);
        results.failed++;
      }
    }

    return results;
  },
});
