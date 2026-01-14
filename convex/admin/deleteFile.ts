import { v } from "convex/values";
import { adminMutation } from "../functions";
import { components } from "../_generated/api";

/**
 * Delete a single file (asset and all its versions) by path.
 * Queues R2 keys for deferred deletion (30-day retention).
 *
 * Usage:
 *   ./scripts/convex run admin/deleteFile:deleteFile '{"folderPath": "books/my-book/characters", "basename": "hero.png"}'
 */
export const deleteFile = adminMutation({
  args: { folderPath: v.string(), basename: v.string() },
  returns: v.object({ deleted: v.boolean(), deletedVersions: v.number() }),
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.versionedAssets.assetManager.deleteFile, args);
  },
});
