// Shared validators for asset-manager component
// These are defined once and reused across all queries/mutations
// to ensure consistency and reduce duplication.

import { v } from "convex/values";

/**
 * Validator fields for a folder document.
 * Use with v.object(folderFields) for returns validators.
 */
export const folderFields = {
  _id: v.id("folders"),
  path: v.string(),
  name: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.optional(v.string()),
  updatedBy: v.optional(v.string()),
  _creationTime: v.number(),
};

/**
 * Validator fields for an asset document.
 * Use with v.object(assetFields) for returns validators.
 */
export const assetFields = {
  _id: v.id("assets"),
  folderPath: v.string(),
  basename: v.string(),
  versionCounter: v.number(),
  publishedVersionId: v.optional(v.id("assetVersions")),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.optional(v.string()),
  updatedBy: v.optional(v.string()),
  _creationTime: v.number(),
};

/**
 * Validator fields for an asset version document.
 * Use with v.object(assetVersionFields) for returns validators.
 */
export const assetVersionFields = {
  _id: v.id("assetVersions"),
  _creationTime: v.number(),
  assetId: v.id("assets"),
  version: v.number(),
  state: v.union(v.literal("published"), v.literal("archived")),
  label: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  r2Key: v.optional(v.string()),
  originalFilename: v.optional(v.string()),
  uploadStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"))),
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
};
