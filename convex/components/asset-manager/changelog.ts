/**
 * Changelog queries for real-time sync.
 * FileProvider clients subscribe to these to know when to refresh.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Compound cursor for reliable pagination.
 * Uses { createdAt, id } to avoid skipping items with identical timestamps.
 * For initial fetch, use { createdAt: 0, id: "" }
 */
const compoundCursorValidator = v.object({ createdAt: v.number(), id: v.string() });

/**
 * Get all changes since a cursor (for global sync).
 * Uses compound cursor (createdAt + id) to ensure no items are skipped
 * when multiple changes have the same timestamp (e.g., during batch imports).
 */
export const listSince = query({
  args: { cursor: compoundCursorValidator, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const { cursor } = args;

    // Use gte to include items at the cursor timestamp, then filter out
    // items we've already seen (same timestamp but id <= cursor.id)
    const changes = await ctx.db
      .query("changelog")
      .withIndex("by_created_at", (q) => q.gte("createdAt", cursor.createdAt))
      .filter((q) =>
        q.or(
          q.gt(q.field("createdAt"), cursor.createdAt),
          q.and(q.eq(q.field("createdAt"), cursor.createdAt), q.gt(q.field("_id"), cursor.id)),
        ),
      )
      .order("asc")
      .take(limit);

    const lastChange = changes[changes.length - 1];
    return {
      changes,
      nextCursor: lastChange ? { createdAt: lastChange.createdAt, id: lastChange._id } : cursor,
    };
  },
});

/**
 * Get changes for a specific folder (for enumerateChanges).
 * Uses compound cursor (createdAt + id) to ensure no items are skipped
 * when multiple changes have the same timestamp (e.g., during batch imports).
 */
export const listForFolder = query({
  args: { folderPath: v.string(), cursor: compoundCursorValidator, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const { cursor } = args;

    // Use gte to include items at the cursor timestamp, then filter out
    // items we've already seen (same timestamp but id <= cursor.id)
    const changes = await ctx.db
      .query("changelog")
      .withIndex("by_folder_path", (q) =>
        q.eq("folderPath", args.folderPath).gte("createdAt", cursor.createdAt),
      )
      .filter((q) =>
        q.or(
          q.gt(q.field("createdAt"), cursor.createdAt),
          q.and(q.eq(q.field("createdAt"), cursor.createdAt), q.gt(q.field("_id"), cursor.id)),
        ),
      )
      .order("asc")
      .take(limit);

    const lastChange = changes[changes.length - 1];
    return {
      changes,
      nextCursor: lastChange ? { createdAt: lastChange.createdAt, id: lastChange._id } : cursor,
    };
  },
});
