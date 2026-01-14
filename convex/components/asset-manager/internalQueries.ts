import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Internal query to get a version's storage info by ID.
 * Used by getSignedUrl action.
 */
export const getVersionStorageInfo = internalQuery({
  args: { versionId: v.id("assetVersions") },
  returns: v.union(
    v.null(),
    v.object({ storageId: v.optional(v.id("_storage")), r2Key: v.optional(v.string()) }),
  ),
  handler: async (ctx, { versionId }) => {
    const version = await ctx.db.get(versionId);
    if (!version) return null;
    return { storageId: version.storageId, r2Key: version.r2Key };
  },
});
