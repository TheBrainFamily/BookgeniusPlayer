import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";

export const regenerateAvatarWebp = action({
  args: { characterPath: v.string() },
  returns: v.object({ success: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, { characterPath }): Promise<{ success: boolean; error?: string }> => {
    return await ctx.runAction(internal.avatarGeneration.processUploadedAvatarLarge, {
      characterPath,
      retryCount: 0,
    });
  },
});
