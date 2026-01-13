/**
 * Changelog queries for real-time sync.
 * FileProvider clients subscribe to these to know when to refresh.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all changes since a cursor (for global sync).
 * The cursor is a createdAt timestamp - pass 0 to get all changes.
 */
export const listSince = query({
  args: { cursor: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    const changes = await ctx.db
      .query("changelog")
      .withIndex("by_created_at", (q) => q.gt("createdAt", args.cursor))
      .order("asc")
      .take(limit);

    return {
      changes,
      nextCursor: changes.length > 0 ? changes[changes.length - 1].createdAt : args.cursor,
    };
  },
});

/**
 * Get changes for a specific folder (for enumerateChanges).
 * Returns only changes that affect the given folder path.
 */
export const listForFolder = query({
  args: { folderPath: v.string(), cursor: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    const changes = await ctx.db
      .query("changelog")
      .withIndex("by_folder_path", (q) =>
        q.eq("folderPath", args.folderPath).gt("createdAt", args.cursor),
      )
      .order("asc")
      .take(limit);

    return {
      changes,
      nextCursor: changes.length > 0 ? changes[changes.length - 1].createdAt : args.cursor,
    };
  },
});
