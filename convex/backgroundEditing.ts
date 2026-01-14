import { v } from "convex/values";
import { internal } from "./_generated/api";
import { bookAction } from "./functions";

export const startBackgroundEdit = bookAction({
  args: { cueId: v.id("backgroundCues"), fileBasename: v.string(), instructions: v.string() },
  returns: v.null(),
  handler: async (ctx, { cueId, fileBasename, instructions }) => {
    const bookPath = ctx.bookPath;
    console.log("[backgroundEditing.startBackgroundEdit] Scheduling edit action", {
      bookPath,
      cueId,
      fileBasename,
      instructionsLength: instructions.length,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.backgroundEditingInternal.editBackgroundWithInstructions,
      { bookPath, cueId, fileBasename, instructions },
    );

    console.log("[backgroundEditing.startBackgroundEdit] Action scheduled successfully");
    return null;
  },
});

export const startBackgroundGeneration = bookAction({
  args: { chapter: v.number(), paragraph: v.number(), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, { chapter, paragraph, prompt }) => {
    const bookPath = ctx.bookPath;
    console.log("[backgroundEditing.startBackgroundGeneration] Scheduling generation action", {
      bookPath,
      chapter,
      paragraph,
      promptLength: prompt.length,
    });

    await ctx.scheduler.runAfter(0, internal.backgroundEditingInternal.generateNewBackground, {
      bookPath,
      chapter,
      paragraph,
      prompt,
    });

    console.log("[backgroundEditing.startBackgroundGeneration] Action scheduled successfully");
    return null;
  },
});
