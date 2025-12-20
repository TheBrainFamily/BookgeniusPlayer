import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,

  // Comic generation submissions tracking
  comicSubmissions: defineTable({
    scenarioPath: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    progress: v.optional(v.number()),
    progressMessage: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    // Result reference - versionId from asset-manager component
    resultVersionId: v.optional(v.string()),
    // Story generation results
    storySlug: v.optional(v.string()),
    storyName: v.optional(v.string()),
    firstScenarioName: v.optional(v.string()),
  })
    .index("by_scenarioPath", ["scenarioPath"])
    .index("by_status", ["status"]),
});
