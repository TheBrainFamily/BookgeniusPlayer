import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const storageBackendValidator = v.union(
  v.literal("convex"),
  v.literal("r2"),
);

const schema = defineSchema({
  /**
   * Storage backend configuration singleton.
   * Default (no row) = "convex" storage.
   */
  storageConfig: defineTable({
    singleton: v.literal("storageConfig"),
    backend: storageBackendValidator,
    // For R2: the public URL base for serving files (e.g., "https://assets.yourdomain.com")
    r2PublicUrl: v.optional(v.string()),
    // For R2: optional prefix for keys to avoid collisions when sharing a bucket across apps
    r2KeyPrefix: v.optional(v.string()),
  }).index("by_singleton", ["singleton"]),

  /**
   * Upload intents track in-progress uploads.
   * Created by startUpload, finalized by finishUpload.
   */
  uploadIntents: defineTable({
    folderPath: v.string(),
    basename: v.string(),
    filename: v.optional(v.string()), // Original filename with extension for URLs
    backend: storageBackendValidator,

    // For R2: key is pre-generated before upload
    r2Key: v.optional(v.string()),

    status: v.union(
      v.literal("created"), // Intent created, waiting for upload
      v.literal("finalized"), // Version created successfully
      v.literal("expired"), // Timed out without completion
    ),

    // Options for version creation
    publish: v.optional(v.boolean()),
    label: v.optional(v.string()),
    extra: v.optional(v.any()),

    createdAt: v.number(),
    expiresAt: v.number(),
    createdBy: v.optional(v.string()),
  })
    .index("by_r2_key", ["r2Key"])
    .index("by_status_expires", ["status", "expiresAt"]),

  folders: defineTable({
    path: v.string(),
    name: v.string(),
    extra: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
  }).index("by_path", ["path"]),
  assets: defineTable({
    folderPath: v.string(),
    basename: v.string(),
    extra: v.optional(v.any()),
    versionCounter: v.number(),
    publishedVersionId: v.optional(v.id("assetVersions")),
    draftVersionId: v.optional(v.id("assetVersions")),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
  }).index("by_folder_basename", ["folderPath", "basename"]),
  assetVersions: defineTable({
    assetId: v.id("assets"),
    version: v.number(),
    state: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),

    label: v.optional(v.string()),
    extra: v.optional(v.any()),

    // File storage metadata - one of storageId (Convex) or r2Key (R2) will be set
    storageId: v.optional(v.id("_storage")),
    r2Key: v.optional(v.string()),
    originalFilename: v.optional(v.string()),
    uploadStatus: v.optional(
      v.union(v.literal("pending"), v.literal("ready")),
    ),
    size: v.optional(v.number()),
    contentType: v.optional(v.string()),
    sha256: v.optional(v.string()),

    createdAt: v.number(),
    createdBy: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    publishedBy: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    archivedBy: v.optional(v.string()),
  })
    .index("by_asset", ["assetId"])
    .index("by_asset_version", ["assetId", "version"]),
  assetEvents: defineTable({
    assetId: v.id("assets"),
    type: v.string(),
    fromFolderPath: v.optional(v.string()),
    toFolderPath: v.optional(v.string()),
    fromBasename: v.optional(v.string()),
    toBasename: v.optional(v.string()),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
  }).index("by_asset", ["assetId"]),
});

export default schema;
