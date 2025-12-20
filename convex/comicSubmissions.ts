// convex/comicSubmissions.ts
import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { components } from "./_generated/api";

// Helper to get result URL from versionId via asset-manager component
async function getResultUrl(
  ctx: { runQuery: any },
  versionId: string | undefined
): Promise<string | null> {
  if (!versionId) return null;
  const result = await ctx.runQuery(
    components.assetManager.assetFsHttp.getVersionPreviewUrl,
    { versionId: versionId as any }
  );
  return result?.url ?? null;
}

// Create a new submission
export const create = mutation({
  args: {
    scenarioPath: v.string(),
  },
  handler: async (ctx, args) => {
    const submissionId = await ctx.db.insert("comicSubmissions", {
      scenarioPath: args.scenarioPath,
      status: "pending",
      createdAt: Date.now(),
    });
    return submissionId;
  },
});

// Create a new submission (internal - for scheduled actions)
export const createInternal = internalMutation({
  args: {
    scenarioPath: v.string(),
    progressMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const submissionId = await ctx.db.insert("comicSubmissions", {
      scenarioPath: args.scenarioPath,
      status: "pending",
      progress: 0,
      progressMessage: args.progressMessage ?? "Pending",
      createdAt: Date.now(),
    });
    return submissionId;
  },
});

// Get a submission by ID
export const get = query({
  args: {
    id: v.id("comicSubmissions"),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.id);
    if (!submission) return null;

    const resultUrl = await getResultUrl(ctx, submission.resultVersionId);

    return {
      ...submission,
      resultUrl,
    };
  },
});

// Get active (pending/processing/completed-with-result) submission for a scenario
export const getActiveByScenario = query({
  args: {
    scenarioPath: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all submissions for this scenario, most recent first
    const submissions = await ctx.db
      .query("comicSubmissions")
      .withIndex("by_scenarioPath", (q) =>
        q.eq("scenarioPath", args.scenarioPath),
      )
      .order("desc")
      .collect();

    // Find the most recent active submission (pending, processing, or completed with unhandled result)
    for (const sub of submissions) {
      if (sub.status === "pending" || sub.status === "processing") {
        return {
          ...sub,
          resultUrl: null,
        };
      }
      // Also return completed submissions that have a result (user needs to Keep/Reject)
      if (sub.status === "completed" && sub.resultVersionId) {
        const resultUrl = await getResultUrl(ctx, sub.resultVersionId);
        return {
          ...sub,
          resultUrl,
        };
      }
    }

    return null;
  },
});

// List submissions for a scenario
export const listByScenario = query({
  args: {
    scenarioPath: v.string(),
  },
  handler: async (ctx, args) => {
    const submissions = await ctx.db
      .query("comicSubmissions")
      .withIndex("by_scenarioPath", (q) =>
        q.eq("scenarioPath", args.scenarioPath),
      )
      .order("desc")
      .collect();

    return Promise.all(
      submissions.map(async (sub) => {
        const resultUrl = await getResultUrl(ctx, sub.resultVersionId);
        return { ...sub, resultUrl };
      }),
    );
  },
});

// List recent submissions
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    const submissions = await ctx.db
      .query("comicSubmissions")
      .order("desc")
      .take(limit);

    return Promise.all(
      submissions.map(async (sub) => {
        const resultUrl = await getResultUrl(ctx, sub.resultVersionId);
        return { ...sub, resultUrl };
      }),
    );
  },
});

// Internal mutation to update progress
export const updateProgress = internalMutation({
  args: {
    id: v.id("comicSubmissions"),
    progress: v.number(),
    progressMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "processing",
      progress: args.progress,
      progressMessage: args.progressMessage,
    });
  },
});

// Internal mutation to mark as completed with versionId
export const completeWithVersion = internalMutation({
  args: {
    id: v.id("comicSubmissions"),
    resultVersionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "completed",
      progress: 100,
      progressMessage: "Generation complete",
      completedAt: Date.now(),
      resultVersionId: args.resultVersionId,
    });
  },
});

// Internal mutation to mark as failed
export const fail = internalMutation({
  args: {
    id: v.id("comicSubmissions"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "failed",
      error: args.error,
      completedAt: Date.now(),
    });
  },
});

// Internal mutation to mark story generation as completed
export const completeStoryGeneration = internalMutation({
  args: {
    id: v.id("comicSubmissions"),
    slug: v.string(),
    storyName: v.string(),
    firstScenarioName: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "completed",
      progress: 100,
      progressMessage: "Story generation complete",
      completedAt: Date.now(),
      storySlug: args.slug,
      storyName: args.storyName,
      firstScenarioName: args.firstScenarioName,
    });
  },
});

// Delete a submission (for cleanup)
export const remove = mutation({
  args: {
    id: v.id("comicSubmissions"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Internal version for scheduled actions
export const removeInternal = internalMutation({
  args: {
    id: v.id("comicSubmissions"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
