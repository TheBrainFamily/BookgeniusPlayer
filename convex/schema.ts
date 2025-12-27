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
      v.literal("failed"),
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

  // Notes (footnotes/annotations)
  notes: defineTable({
    bookPath: v.string(),
    noteId: v.string(),
    content: v.string(),
    chapter: v.number(),
    paragraph: v.optional(v.number()),
  })
    .index("by_book", ["bookPath"])
    .index("by_book_chapter", ["bookPath", "chapter"]),

  // Variants (sentence simplifications)
  variants: defineTable({
    bookPath: v.string(),
    variantId: v.string(),
    chapter: v.number(),
    simplifications: v.array(v.object({ score: v.number(), sentences: v.array(v.string()) })),
  })
    .index("by_book", ["bookPath"])
    .index("by_book_chapter", ["bookPath", "chapter"]),

  // Background cue points (links backgrounds/ files to chapter/paragraph positions)
  backgroundCues: defineTable({
    bookPath: v.string(),
    fileBasename: v.string(),
    chapter: v.number(),
    paragraph: v.number(),
    backgroundColor: v.optional(v.string()),
    textColor: v.optional(v.string()),
  })
    .index("by_book", ["bookPath"])
    .index("by_book_position", ["bookPath", "chapter", "paragraph"]),

  // Music cue points (links music/ files to chapter/paragraph positions)
  musicCues: defineTable({
    bookPath: v.string(),
    fileBasename: v.string(),
    chapter: v.number(),
    paragraph: v.number(),
    order: v.optional(v.number()), // Order within same chapter/paragraph group (0-indexed)
  })
    .index("by_book", ["bookPath"])
    .index("by_book_position", ["bookPath", "chapter", "paragraph"]),

  // Music file metadata (extracted from ID3 tags at upload time)
  musicFileMetadata: defineTable({
    bookPath: v.string(),
    fileBasename: v.string(), // "intro.mp3"
    coverBasename: v.optional(v.string()), // "intro.jpg" in music-covers/
    title: v.optional(v.string()), // From ID3 tag
    artist: v.optional(v.string()), // From ID3 tag
    duration: v.optional(v.number()), // Seconds
    extractedAt: v.number(), // Timestamp
  }).index("by_book_file", ["bookPath", "fileBasename"]),

  // Background file metadata (preview generation status + thumbnails)
  backgroundFileMetadata: defineTable({
    bookPath: v.string(),
    fileBasename: v.string(), // "castle.mp4" or "forest.png"
    fileType: v.union(v.literal("video"), v.literal("image")),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    previewMp4Basename: v.optional(v.string()), // "castle_preview.mp4" (video only)
    previewWebpBasename: v.optional(v.string()), // "castle_preview.webp"
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_book_file", ["bookPath", "fileBasename"]),

  // Book generation jobs (tracks pipeline progress from generator server)
  bookGenerationJobs: defineTable({
    jobId: v.string(), // UUID from generator server
    bookPath: v.string(), // "books/{slug}"
    bookSlug: v.string(), // Just the slug for convenience
    status: v.union(
      v.literal("pending"),
      v.literal("generating"),
      v.literal("paused"),
      v.literal("failed"),
      v.literal("completed"),
    ),
    currentStep: v.optional(v.string()), // Current pipeline step name
    steps: v.array(
      v.object({
        step: v.string(),
        status: v.union(
          v.literal("pending"),
          v.literal("running"),
          v.literal("done"),
          v.literal("error"),
          v.literal("skipped"),
        ),
        startedAt: v.optional(v.number()),
        endedAt: v.optional(v.number()),
        message: v.optional(v.string()),
      }),
    ),
    // Progress tracking
    totalChapters: v.optional(v.number()),
    readyChapters: v.optional(v.number()), // Chapters with compiled HTML
    // Error tracking
    error: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    lastHeartbeatAt: v.optional(v.number()),
  })
    .index("by_jobId", ["jobId"])
    .index("by_bookPath", ["bookPath"])
    .index("by_status", ["status"]),
});
