import { v } from "convex/values";
import { adminMutation, adminQuery } from "../functions";
import { components } from "../_generated/api";

/**
 * List pending R2 deletions (for debugging/admin).
 *
 * Usage:
 *   ./scripts/convex run admin/r2Deletions:listPendingR2Deletions '{}'
 *   ./scripts/convex run admin/r2Deletions:listPendingR2Deletions '{"onlyExpired": true}'
 */
export const listPendingR2Deletions = adminQuery({
  args: { limit: v.optional(v.number()), onlyExpired: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.versionedAssets.assetManager.listPendingR2Deletions, args);
  },
});

/**
 * Process expired R2 deletions and return keys that should be deleted from R2.
 * Call this from a cleanup script, then use the returned r2KeysToDelete to delete from R2.
 *
 * Usage:
 *   ./scripts/convex run admin/r2Deletions:processExpiredR2Deletions '{}'
 *   ./scripts/convex run admin/r2Deletions:processExpiredR2Deletions '{"forceAll": true}'  # Skip retention period
 */
export const processExpiredR2Deletions = adminMutation({
  args: { batchSize: v.optional(v.number()), forceAll: v.optional(v.boolean()) },
  returns: v.object({
    processed: v.number(),
    r2KeysToDelete: v.array(v.string()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    return await ctx.runMutation(
      components.versionedAssets.assetManager.processExpiredR2Deletions,
      args,
    );
  },
});

/**
 * Cancel a pending R2 deletion (restore before hard-delete).
 *
 * Usage:
 *   ./scripts/convex run admin/r2Deletions:cancelPendingR2Deletion '{"r2Key": "bookgenius/abc123/file.png"}'
 */
export const cancelPendingR2Deletion = adminMutation({
  args: { r2Key: v.string() },
  returns: v.object({ cancelled: v.boolean() }),
  handler: async (ctx, args) => {
    return await ctx.runMutation(
      components.versionedAssets.assetManager.cancelPendingR2Deletion,
      args,
    );
  },
});
