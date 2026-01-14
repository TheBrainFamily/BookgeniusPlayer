// convex/components/asset-manager/_testStoreFakeFile.ts
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const _testStoreFakeFile = internalAction({
  args: { size: v.optional(v.number()), contentType: v.optional(v.string()) },
  returns: v.id("_storage"),
  handler: async (ctx, args) => {
    // Use a predictable byte length so tests can assert on `size`
    const n = args.size ?? 1;
    const bytes = new Uint8Array(n); // all zeros is fine
    const blob = new Blob([bytes], { type: args.contentType ?? "application/octet-stream" });

    const storageId = await ctx.storage.store(blob);
    return storageId;
  },
});
