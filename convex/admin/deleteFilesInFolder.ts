import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { components } from "../_generated/api";

/**
 * Delete all files (assets and their versions) in a specific folder.
 * Does NOT delete the folder itself or subfolders.
 *
 * Usage:
 *   npx convex run admin/deleteFilesInFolder:deleteFilesInFolder '{"folderPath": "books/my-book/characters/hero"}'
 *
 * To delete only avatar files:
 *   npx convex run admin/deleteFilesInFolder:deleteFilesInFolder '{"folderPath": "books/my-book/characters/hero", "basenames": ["avatar-large.png", "avatar.webp"]}'
 */
export const deleteFilesInFolder = mutation({
  args: {
    folderPath: v.string(),
    // Optional: only delete files matching these basenames (e.g., ["avatar-large.png", "avatar.webp"])
    basenames: v.optional(v.array(v.string())),
  },
  returns: v.object({ deletedAssets: v.number(), deletedVersions: v.number() }),
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.assetManager.assetManager.deleteFilesInFolder, args);
  },
});
