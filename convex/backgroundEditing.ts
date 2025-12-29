import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export const startBackgroundEdit = action({
  args: {
    bookPath: v.string(),
    cueId: v.id("backgroundCues"),
    fileBasename: v.string(),
    instructions: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log("[backgroundEditing.startBackgroundEdit] Scheduling edit action", {
      bookPath: args.bookPath,
      cueId: args.cueId,
      fileBasename: args.fileBasename,
      instructionsLength: args.instructions.length,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.backgroundEditingInternal.editBackgroundWithInstructions,
      args,
    );

    console.log("[backgroundEditing.startBackgroundEdit] Action scheduled successfully");
    return null;
  },
});

export const startBackgroundGeneration = action({
  args: { bookPath: v.string(), chapter: v.number(), paragraph: v.number(), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log("[backgroundEditing.startBackgroundGeneration] Scheduling generation action", {
      bookPath: args.bookPath,
      chapter: args.chapter,
      paragraph: args.paragraph,
      promptLength: args.prompt.length,
    });

    await ctx.scheduler.runAfter(0, internal.backgroundEditingInternal.generateNewBackground, args);

    console.log("[backgroundEditing.startBackgroundGeneration] Action scheduled successfully");
    return null;
  },
});
