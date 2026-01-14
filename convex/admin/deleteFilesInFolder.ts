import { v } from "convex/values";
import { adminMutation } from "../functions";
import { components } from "../_generated/api";

/**
 * Delete all files (assets and their versions) in a specific folder.
 * Does NOT delete the folder itself or subfolders.
 *
 * Usage:
 *   ./scripts/convex run admin/deleteFilesInFolder:deleteFilesInFolder '{"folderPath": "books/my-book/characters/hero"}'
 *
 * To delete only avatar files:
 *   ./scripts/convex run admin/deleteFilesInFolder:deleteFilesInFolder '{"folderPath": "books/my-book/characters/hero", "basenames": ["avatar-large.png", "avatar.webp"]}'
 */
export const deleteFilesInFolder = adminMutation({
  args: {
    folderPath: v.string(),
    // Optional: only delete files matching these basenames (e.g., ["avatar-large.png", "avatar.webp"])
    basenames: v.optional(v.array(v.string())),
  },
  returns: v.object({ deletedAssets: v.number(), deletedVersions: v.number() }),
  handler: async (ctx, args) => {
    return await ctx.runMutation(components.versionedAssets.assetManager.deleteFilesInFolder, args);
  },
});
