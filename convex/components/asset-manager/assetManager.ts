import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { slugify } from "./slugify";
import { allocateFolderSegment } from "./allocateFolderSegment";
import { getActorFields } from "./authAdapter";
import { type Id } from "./_generated/dataModel";
import { folderFields, assetFields, assetVersionFields } from "./validators";
import { storageBackendValidator } from "./schema";
import { createR2Client } from "./r2Client";
import { logChange } from "./helpers/changelog";

// Validator for R2 config passed from app layer
const r2ConfigValidator = v.object({
  R2_BUCKET: v.string(),
  R2_ENDPOINT: v.string(),
  R2_ACCESS_KEY_ID: v.string(),
  R2_SECRET_ACCESS_KEY: v.string(),
});

const ROOT_PARENT = "" as const;

// Default upload URL expiration: 1 hour
const UPLOAD_INTENT_EXPIRY_MS = 60 * 60 * 1000;

interface StorageConfig {
  backend: "convex" | "r2";
  r2PublicUrl?: string;
  r2KeyPrefix?: string;
}

// =============================================================================
// Storage Type Helpers
// =============================================================================

// interface StorageReference {
//   storageId?: Id<"_storage">;
//   r2Key?: string;
// }

// function isStoredOnConvex(
//   ref: StorageReference,
// ): ref is StorageReference & { storageId: Id<"_storage"> } {
//   return ref.storageId !== undefined;
// }

// function isStoredOnR2(ref: StorageReference): ref is StorageReference & { r2Key: string } {
//   return ref.r2Key !== undefined;
// }

/**
 * Get the current storage backend configuration.
 * Defaults to "convex" if no configuration exists.
 */
async function getStorageBackend(ctx: QueryCtx | MutationCtx): Promise<"convex" | "r2"> {
  const config = await getStorageConfig(ctx);
  return config.backend;
}

/**
 * Get the full storage configuration including R2 public URL.
 */
async function getStorageConfig(ctx: QueryCtx | MutationCtx): Promise<StorageConfig> {
  const config = await ctx.db
    .query("storageConfig")
    .withIndex("by_singleton", (q) => q.eq("singleton", "storageConfig"))
    .first();
  return {
    backend: config?.backend ?? "convex",
    r2PublicUrl: config?.r2PublicUrl,
    r2KeyPrefix: config?.r2KeyPrefix,
  };
}

/**
 * Get the public URL for an R2 key.
 * Uses the configured r2PublicUrl from storageConfig.
 * Requires r2PublicUrl to be configured - no fallback to signed URLs.
 */
async function getR2PublicUrl(ctx: QueryCtx | MutationCtx, r2Key: string): Promise<string | null> {
  const config = await getStorageConfig(ctx);
  if (!config.r2PublicUrl) {
    console.error("R2 public URL not configured. Call configureStorageBackend with r2PublicUrl.");
    return null;
  }
  // Remove trailing slash if present, then append key
  const baseUrl = config.r2PublicUrl.replace(/\/+$/, "");
  return `${baseUrl}/${r2Key}`;
}

function normalizeFolderPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "/") return "";
  // Strip leading/trailing slashes and collapse multiple slashes
  const withoutSlashes = trimmed.replace(/^\/+|\/+$/g, "");
  if (!withoutSlashes) return "";
  // You can add more validation here if you like (no `..`, etc.)
  return withoutSlashes;
}

// Default retention period for soft-deleted R2 files (30 days)
const R2_DELETION_RETENTION_DAYS = 30;

/**
 * Queue an R2 key for deferred deletion.
 * The key will be eligible for hard-deletion after the retention period.
 */
async function queueR2Deletion(
  ctx: MutationCtx,
  r2Key: string,
  originalPath: string,
  deletedBy?: string,
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("pendingR2Deletions", {
    r2Key,
    originalPath,
    deletedAt: now,
    deleteAfter: now + R2_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    deletedBy,
  });
}

// =============================================================================
// Storage Backend Configuration
// =============================================================================

/**
 * Configure which storage backend to use for new uploads.
 * Call once to switch from Convex storage to R2 (or back).
 *
 * For R2, you must provide r2PublicUrl - the public URL base for serving files
 * (e.g., "https://assets.yourdomain.com"). This requires setting up a custom
 * domain on your R2 bucket in Cloudflare.
 *
 * Optionally provide r2KeyPrefix to namespace files when sharing a bucket
 * across multiple apps (e.g., "my-app" results in keys like "my-app/abc123/file.mp3").
 */
export const configureStorageBackend = mutation({
  args: {
    backend: storageBackendValidator,
    // Required when backend is "r2" - the public URL base for serving files
    r2PublicUrl: v.optional(v.string()),
    // Optional prefix for R2 keys to avoid collisions when sharing a bucket
    r2KeyPrefix: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Validate R2 config
    if (args.backend === "r2" && !args.r2PublicUrl) {
      throw new Error(
        "r2PublicUrl is required when using R2 backend. " +
          "Set up a custom domain on your R2 bucket and provide the URL.",
      );
    }

    const existing = await ctx.db
      .query("storageConfig")
      .withIndex("by_singleton", (q) => q.eq("singleton", "storageConfig"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        backend: args.backend,
        r2PublicUrl: args.r2PublicUrl,
        r2KeyPrefix: args.r2KeyPrefix,
      });
    } else {
      await ctx.db.insert("storageConfig", {
        singleton: "storageConfig",
        backend: args.backend,
        r2PublicUrl: args.r2PublicUrl,
        r2KeyPrefix: args.r2KeyPrefix,
      });
    }
    return null;
  },
});

/**
 * Get the current storage backend configuration.
 */
export const getStorageBackendConfig = query({
  args: {},
  returns: storageBackendValidator,
  handler: async (ctx) => {
    return await getStorageBackend(ctx);
  },
});

// =============================================================================
// Intent-based Upload Flow
// =============================================================================

/**
 * Start an upload. Creates an upload intent and returns the upload URL.
 * This replaces the old generateUploadUrl + commitUpload pattern.
 *
 * Flow:
 * 1. Call startUpload() to get intentId + uploadUrl
 * 2. Upload file to the URL
 * 3. Call finishUpload() with intentId (+ storageId for Convex backend)
 */
export const startUpload = mutation({
  args: {
    folderPath: v.string(),
    basename: v.string(),
    filename: v.optional(v.string()), // Original filename with extension for URLs
    label: v.optional(v.string()),
    // R2 config passed from app layer (components can't access env vars)
    r2Config: v.optional(r2ConfigValidator),
  },
  returns: v.object({
    intentId: v.id("uploadIntents"),
    backend: storageBackendValidator,
    uploadUrl: v.string(),
    r2Key: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const folderPath = normalizeFolderPath(args.folderPath);
    if (args.basename.includes("/")) {
      throw new Error("basename must not contain '/'");
    }

    const now = Date.now();
    const actorFields = await getActorFields(ctx);
    const storageConfig = await getStorageConfig(ctx);
    const backend = storageConfig.backend;

    // Create upload intent first (we need the ID for R2 key)
    const intentId = await ctx.db.insert("uploadIntents", {
      folderPath,
      basename: args.basename,
      filename: args.filename,
      backend,
      r2Key: undefined, // Will be set below for R2
      status: "created",
      label: args.label,
      createdAt: now,
      expiresAt: now + UPLOAD_INTENT_EXPIRY_MS,
      createdBy: actorFields.createdBy,
    });

    let uploadUrl: string;
    let r2Key: string | undefined;

    if (backend === "r2") {
      if (!args.r2Config) {
        throw new Error("r2Config is required when using R2 backend");
      }
      // Build R2 key: {prefix/}{intentId}/{filename}
      const filename = args.filename ?? args.basename;
      const prefix = storageConfig.r2KeyPrefix ? `${storageConfig.r2KeyPrefix}/` : "";
      r2Key = `${prefix}${intentId}/${filename}`;

      // Update intent with the r2Key
      await ctx.db.patch(intentId, { r2Key });

      const r2Client = createR2Client(args.r2Config);
      const result = await r2Client.generateUploadUrl(r2Key);
      uploadUrl = result.url;
    } else {
      // Use native Convex storage
      uploadUrl = await ctx.storage.generateUploadUrl();
    }

    return { intentId, backend, uploadUrl, r2Key };
  },
});

/**
 * Finish an upload. Creates the asset version from a completed upload intent.
 *
 * For Convex backend: requires storageId from the upload response.
 * For R2 backend: storageId is not needed (we use the r2Key from the intent).
 */
export const finishUpload = mutation({
  args: {
    intentId: v.id("uploadIntents"),
    // The parsed JSON response from the upload. Backend extracts what it needs.
    // For Convex: expects { storageId: "..." }
    // For R2: ignored (r2Key is in the intent)
    uploadResponse: v.optional(v.any()),
    // R2 config passed from app layer (components can't access env vars)
    r2Config: v.optional(r2ConfigValidator),
    // Client-provided file metadata (required for R2 since we can't fetch from R2 in a mutation)
    size: v.optional(v.number()),
    contentType: v.optional(v.string()),
  },
  returns: v.object({
    assetId: v.id("assets"),
    versionId: v.id("assetVersions"),
    version: v.number(),
  }),

  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      throw new Error("Upload intent not found");
    }
    if (intent.status !== "created") {
      throw new Error(`Upload intent is ${intent.status}, expected created`);
    }
    if (intent.expiresAt < Date.now()) {
      await ctx.db.patch(args.intentId, { status: "expired" });
      throw new Error("Upload intent has expired");
    }

    const now = Date.now();
    const actorFields = await getActorFields(ctx);
    // Get file metadata based on backend
    let storageId: Id<"_storage"> | undefined;
    let r2Key: string | undefined;
    let size: number | undefined;
    let contentType: string | undefined;
    let sha256: string | undefined;

    if (intent.backend === "r2") {
      if (!intent.r2Key) {
        throw new Error("R2 upload intent missing r2Key");
      }
      r2Key = intent.r2Key;

      // Use client-provided metadata (can't fetch from R2 in a mutation)
      size = args.size;
      contentType = args.contentType;
      // sha256 not available from client upload
    } else {
      // Convex backend - extract storageId from uploadResponse
      const responseStorageId = args.uploadResponse?.storageId;
      if (!responseStorageId) {
        throw new Error("uploadResponse.storageId is required for Convex backend uploads");
      }
      storageId = responseStorageId as Id<"_storage">;

      // Get metadata from Convex _storage
      const fileDoc = await ctx.db.system.get(storageId);
      if (!fileDoc) {
        throw new Error("File metadata not found in _storage");
      }
      size = fileDoc.size;
      contentType = fileDoc.contentType;
      sha256 = fileDoc.sha256;
    }

    // Look up or create asset
    let asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", intent.folderPath).eq("basename", intent.basename),
      )
      .first();

    let assetId: Id<"assets">;
    let nextVersion: number;

    if (!asset) {
      // New asset - create it with version 1
      nextVersion = 1;
      assetId = await ctx.db.insert("assets", {
        folderPath: intent.folderPath,
        basename: intent.basename,
        versionCounter: nextVersion,
        publishedVersionId: undefined,
        createdAt: now,
        updatedAt: now,
        ...actorFields,
      });
      asset = await ctx.db.get(assetId);
    } else {
      assetId = asset._id;
      nextVersion = (asset.versionCounter ?? 0) + 1;
      await ctx.db.patch(asset._id, {
        versionCounter: nextVersion,
        updatedAt: now,
        updatedBy: actorFields.updatedBy,
      });
    }

    // Insert new version (always published)
    const versionId = await ctx.db.insert("assetVersions", {
      assetId,
      version: nextVersion,
      state: "published",
      label: intent.label,
      storageId,
      r2Key,
      originalFilename: intent.filename ?? intent.basename,
      uploadStatus: "ready",
      size,
      contentType,
      sha256,
      createdAt: now,
      createdBy: actorFields.createdBy,
      publishedAt: now,
      publishedBy: actorFields.updatedBy,
      archivedAt: undefined,
      archivedBy: undefined,
    });

    // Archive old published version if needed
    if (asset?.publishedVersionId) {
      await ctx.db.patch(asset.publishedVersionId, {
        state: "archived",
        archivedAt: now,
        archivedBy: actorFields.updatedBy,
      });
    }

    await ctx.db.patch(assetId, {
      publishedVersionId: versionId,
      updatedAt: now,
      updatedBy: actorFields.updatedBy,
    });

    // Mark intent as finalized
    await ctx.db.patch(args.intentId, { status: "finalized" });

    // Log for real-time sync (files are always published now)
    await logChange(ctx, "asset:publish", intent.folderPath, {
      basename: intent.basename,
      performedBy: actorFields.updatedBy,
    });

    return { assetId, versionId, version: nextVersion };
  },
});

// =============================================================================
// Folder Management
// =============================================================================

export const createFolderByPath = mutation({
  args: { path: v.string(), name: v.optional(v.string()) },
  returns: v.id("folders"),
  handler: async (ctx, args) => {
    const newFolderPath = normalizeFolderPath(args.path);
    if (newFolderPath.trim().length === 0) {
      throw new Error("Folder path cannot be empty");
    }
    const existing = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.eq("path", newFolderPath))
      .first();

    if (existing) {
      throw new Error("Folder already exists");
    }

    const now = Date.now();

    const actorFields = await getActorFields(ctx);
    const id = await ctx.db.insert("folders", {
      path: newFolderPath,
      name: args.name ?? newFolderPath.split("/").pop()!,
      createdAt: now,
      updatedAt: now,
      ...actorFields,
    });

    // Log for real-time sync
    await logChange(ctx, "folder:create", newFolderPath, { performedBy: actorFields.createdBy });

    return id;
  },
});

function joinPath(parent: string, segment: string): string {
  return parent ? `${parent}/${segment}` : segment;
}

export const createFolderByName = mutation({
  args: { parentPath: v.string(), name: v.string() },
  returns: v.id("folders"),
  handler: async (ctx, args) => {
    const normalizedParentPath = normalizeFolderPath(args.parentPath);
    const slugifiedName = slugify(args.name);
    let newFolderPath = joinPath(normalizedParentPath, slugifiedName);

    const existing = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.eq("path", joinPath(normalizedParentPath, slugifiedName)))
      .first();

    if (existing) {
      if (args.name !== existing.name) {
        const segment = await allocateFolderSegment(ctx, normalizedParentPath, slugifiedName);
        newFolderPath = joinPath(normalizedParentPath, segment);
      } else {
        throw new Error("Folder already exists");
      }
    }

    const now = Date.now();
    const actorFields = await getActorFields(ctx);
    const id = await ctx.db.insert("folders", {
      path: newFolderPath,
      name: args.name,
      createdAt: now,
      updatedAt: now,
      ...actorFields,
    });

    // Log for real-time sync
    await logChange(ctx, "folder:create", newFolderPath, { performedBy: actorFields.createdBy });

    return id;
  },
});

export const getFolder = query({
  args: { path: v.string() },
  returns: v.union(v.null(), v.object(folderFields)),
  handler: async (ctx, args) => {
    const normalized = normalizeFolderPath(args.path);
    if (!normalized) return null;

    const folder = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.eq("path", normalized))
      .first();

    return folder ?? null;
  },
});

const SUFFIX = "\uffff";

const depth = (path: string): number => path.split("/").length;
export const listFolders = query({
  args: { parentPath: v.optional(v.string()) },
  returns: v.array(v.object(folderFields)),
  handler: async (ctx, args) => {
    const parentPath =
      args.parentPath === undefined ? ROOT_PARENT : normalizeFolderPath(args.parentPath);
    const parentPrefix = parentPath ? `${parentPath}/` : "";
    const end = `${parentPrefix}${SUFFIX}`;
    const candidates = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.gte("path", parentPrefix).lt("path", end))
      .order("asc")
      .collect();
    return candidates.filter((candidate) => depth(candidate.path) === depth(parentPrefix));
  },
});

/**
 * List ALL folders in the system (for bulk sync operations).
 * Returns all folders sorted by path.
 */
export const listAllFolders = query({
  args: {},
  returns: v.array(v.object(folderFields)),
  handler: async (ctx) => {
    return await ctx.db.query("folders").withIndex("by_path").order("asc").collect();
  },
});

export const listFoldersWithAssets = query({
  args: { parentPath: v.string() },
  returns: v.array(
    v.object({
      folder: v.object(folderFields),
      assets: v.array(
        v.object({
          basename: v.string(),
          url: v.string(),
          versionId: v.id("assetVersions"),
          contentType: v.optional(v.string()),
          size: v.optional(v.number()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const parentPath = normalizeFolderPath(args.parentPath);
    const parentPrefix = parentPath ? `${parentPath}/` : "";
    const end = `${parentPrefix}${SUFFIX}`;
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.gte("path", parentPrefix).lt("path", end))
      .order("asc")
      .collect();
    const directChildren = folders.filter((f) => depth(f.path) === depth(parentPrefix));

    if (directChildren.length === 0) {
      return [];
    }

    const allAssets = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.gte("folderPath", parentPrefix).lt("folderPath", end),
      )
      .collect();

    const directChildPaths = new Set(directChildren.map((f) => f.path));
    const assetsInDirectChildren = allAssets.filter((a) => directChildPaths.has(a.folderPath));

    const versionIdsToFetch = new Set<Id<"assetVersions">>();
    for (const asset of assetsInDirectChildren) {
      const versionId = asset.publishedVersionId;
      if (versionId) versionIdsToFetch.add(versionId);
    }

    const versionsMap = new Map<
      string,
      { r2Key?: string; storageId?: Id<"_storage">; contentType?: string; size?: number }
    >();
    for (const versionId of versionIdsToFetch) {
      const version = await ctx.db.get(versionId);
      if (version) {
        versionsMap.set(versionId, {
          r2Key: version.r2Key,
          storageId: version.storageId,
          contentType: version.contentType,
          size: version.size,
        });
      }
    }

    const storageConfig = await getStorageConfig(ctx);
    const r2BaseUrl = storageConfig.r2PublicUrl?.replace(/\/+$/, "");

    const urlsMap = new Map<string, string>();
    for (const [versionId, version] of versionsMap) {
      if (version.r2Key && r2BaseUrl) {
        urlsMap.set(versionId, `${r2BaseUrl}/${version.r2Key}`);
      } else if (version.storageId) {
        const url = await ctx.storage.getUrl(version.storageId);
        if (url) urlsMap.set(versionId, url);
      }
    }

    const assetsByFolder = new Map<string, typeof assetsInDirectChildren>();
    for (const asset of assetsInDirectChildren) {
      const existing = assetsByFolder.get(asset.folderPath) || [];
      existing.push(asset);
      assetsByFolder.set(asset.folderPath, existing);
    }

    return directChildren.map((folder) => {
      const folderAssets = assetsByFolder.get(folder.path) || [];
      const assetsWithUrls = folderAssets
        .map((asset) => {
          const versionId = asset.publishedVersionId;
          if (!versionId) return null;

          const url = urlsMap.get(versionId);
          if (!url) return null;

          const version = versionsMap.get(versionId);
          return {
            basename: asset.basename,
            url,
            versionId,
            contentType: version?.contentType,
            size: version?.size,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);

      return { folder, assets: assetsWithUrls };
    });
  },
});

export const updateFolder = mutation({
  args: { path: v.string(), name: v.optional(v.string()), newPath: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const normalized = normalizeFolderPath(args.path);
    if (!normalized) {
      throw new Error("Folder path cannot be empty");
    }

    const existing = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.eq("path", normalized))
      .first();

    if (!existing) {
      throw new Error("Folder does not exist");
    }

    if (args.newPath) {
      const newNormalized = normalizeFolderPath(args.newPath);
      const newExisting = await ctx.db
        .query("folders")
        .withIndex("by_path", (q) => q.eq("path", newNormalized))
        .first();
      if (newExisting) {
        throw new Error("New path already exists");
      }
    }

    const now = Date.now();
    const actorFields = await getActorFields(ctx);
    const finalPath = args.newPath ?? existing.path;
    await ctx.db.patch(existing._id, {
      name: args.name ?? existing.name,
      path: finalPath,
      updatedAt: now,
      updatedBy: actorFields.updatedBy,
    });

    // Log for real-time sync
    await logChange(ctx, "folder:update", finalPath, { performedBy: actorFields.updatedBy });

    return existing._id;
  },
});

export const createAsset = mutation({
  args: { folderPath: v.string(), basename: v.string() },
  returns: v.id("assets"),
  handler: async (ctx, args) => {
    const folderPath = normalizeFolderPath(args.folderPath);
    if (args.basename.includes("/")) {
      throw new Error("basename must not contain '/'");
    }

    const existing = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", folderPath).eq("basename", args.basename),
      )
      .first();

    if (existing) {
      throw new Error("Asset already exists");
    }

    const now = Date.now();
    const actorFields = await getActorFields(ctx);

    return await ctx.db.insert("assets", {
      folderPath,
      basename: args.basename,
      versionCounter: 0,
      createdAt: now,
      updatedAt: now,
      ...actorFields,
    });
  },
});

export const getAsset = query({
  args: { folderPath: v.string(), basename: v.string() },
  returns: v.union(v.null(), v.object(assetFields)),
  handler: async (ctx, args) => {
    const normalizedFolderPath = normalizeFolderPath(args.folderPath);

    const normalizedBasename = args.basename.trim();
    if (!normalizedBasename) {
      return null;
    }
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", normalizedFolderPath).eq("basename", normalizedBasename),
      )
      .first();
    return asset ?? null;
  },
});

export const listAssets = query({
  args: { folderPath: v.string() },
  returns: v.array(v.object(assetFields)),
  handler: async (ctx, args) => {
    const normalizedFolderPath = normalizeFolderPath(args.folderPath);

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) => q.eq("folderPath", normalizedFolderPath))
      .order("asc")
      .collect();
    return assets;
  },
});

export const getFolderWithAssets = query({
  args: { path: v.string() },
  returns: v.union(
    v.null(),
    v.object({ folder: v.object(folderFields), assets: v.array(v.object(assetFields)) }),
  ),
  handler: async (ctx, args) => {
    const folderPath = normalizeFolderPath(args.path);
    if (!folderPath) return null;

    const folder = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.eq("path", folderPath))
      .first();

    if (!folder) return null;

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) => q.eq("folderPath", folderPath))
      .collect();

    return { folder, assets };
  },
});
export const commitVersion = mutation({
  args: { folderPath: v.string(), basename: v.string(), label: v.optional(v.string()) },
  returns: v.object({
    assetId: v.id("assets"),
    versionId: v.id("assetVersions"),
    version: v.number(),
  }),
  handler: async (ctx, args) => {
    const normalizedFolderPath = normalizeFolderPath(args.folderPath);
    const normalizedBasename = args.basename.trim();
    if (!normalizedBasename) {
      throw new Error("basename cannot be empty");
    }

    const now = Date.now();
    const actorFields = await getActorFields(ctx);

    const asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", normalizedFolderPath).eq("basename", normalizedBasename),
      )
      .first();

    let assetId: Id<"assets">;
    let newVersionNumber: number;

    if (!asset) {
      // Create new asset
      assetId = await ctx.db.insert("assets", {
        folderPath: normalizedFolderPath,
        basename: normalizedBasename,
        versionCounter: 1,
        createdAt: now,
        updatedAt: now,
        ...actorFields,
      });
      newVersionNumber = 1;
    } else {
      // Update existing asset
      newVersionNumber = asset.versionCounter + 1;
      await ctx.db.patch(asset._id, {
        versionCounter: newVersionNumber,
        updatedAt: now,
        updatedBy: actorFields.updatedBy,
      });
      assetId = asset._id;
    }

    // Create new version
    const versionId = await ctx.db.insert("assetVersions", {
      assetId,
      version: newVersionNumber,
      state: "published",
      label: args.label,
      createdAt: now,
      ...actorFields,
      publishedAt: now,
      publishedBy: actorFields.createdBy,
    });

    // If there's an existing published version, archive it
    if (asset?.publishedVersionId) {
      await ctx.db.patch(asset.publishedVersionId, {
        state: "archived",
        archivedAt: now,
        archivedBy: actorFields.updatedBy,
      });
    }

    // Update asset with new published version
    await ctx.db.patch(assetId, {
      publishedVersionId: versionId,
      updatedAt: now,
      updatedBy: actorFields.updatedBy,
    });

    return { assetId, versionId, version: newVersionNumber };
  },
});

/**
 * Create an asset version from an existing Convex storageId.
 * Use this for migrations - copying files by reference without re-uploading.
 *
 * For new uploads, use startUpload + finishUpload instead.
 */
export const createVersionFromStorageId = mutation({
  args: {
    folderPath: v.string(),
    basename: v.string(),
    storageId: v.id("_storage"),
    label: v.optional(v.string()),
  },
  returns: v.object({
    assetId: v.id("assets"),
    versionId: v.id("assetVersions"),
    version: v.number(),
  }),

  handler: async (ctx, args) => {
    const folderPath = normalizeFolderPath(args.folderPath);
    if (args.basename.includes("/")) {
      throw new Error("basename must not contain '/'");
    }

    const now = Date.now();
    const actorFields = await getActorFields(ctx);
    // Get metadata from Convex _storage
    const fileDoc = await ctx.db.system.get(args.storageId);
    if (!fileDoc) {
      throw new Error("File metadata not found in _storage");
    }

    // Look up or create asset
    let asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", folderPath).eq("basename", args.basename),
      )
      .first();

    let assetId: Id<"assets">;
    let nextVersion: number;

    if (!asset) {
      // New asset - create it with version 1
      nextVersion = 1;
      assetId = await ctx.db.insert("assets", {
        folderPath,
        basename: args.basename,
        versionCounter: nextVersion,
        publishedVersionId: undefined,
        createdAt: now,
        updatedAt: now,
        ...actorFields,
      });
      asset = await ctx.db.get(assetId);
    } else {
      assetId = asset._id;
      nextVersion = (asset.versionCounter ?? 0) + 1;
      await ctx.db.patch(asset._id, {
        versionCounter: nextVersion,
        updatedAt: now,
        updatedBy: actorFields.updatedBy,
      });
    }

    // Insert new version (always published)
    const versionId = await ctx.db.insert("assetVersions", {
      assetId,
      version: nextVersion,
      state: "published",
      label: args.label,
      storageId: args.storageId,
      r2Key: undefined,
      size: fileDoc.size,
      contentType: fileDoc.contentType,
      sha256: fileDoc.sha256,
      createdAt: now,
      createdBy: actorFields.createdBy,
      publishedAt: now,
      publishedBy: actorFields.updatedBy,
      archivedAt: undefined,
      archivedBy: undefined,
    });

    // Archive old published version if needed
    if (asset?.publishedVersionId) {
      await ctx.db.patch(asset.publishedVersionId, {
        state: "archived",
        archivedAt: now,
        archivedBy: actorFields.updatedBy,
      });
    }

    await ctx.db.patch(assetId, {
      publishedVersionId: versionId,
      updatedAt: now,
      updatedBy: actorFields.updatedBy,
    });

    // Log for real-time sync (files are always published now)
    await logChange(ctx, "asset:publish", folderPath, {
      basename: args.basename,
      performedBy: actorFields.updatedBy,
    });

    return { assetId, versionId, version: nextVersion };
  },
});

export const getAssetVersions = query({
  args: { folderPath: v.string(), basename: v.string() },
  returns: v.array(v.object(assetVersionFields)),
  handler: async (ctx, args) => {
    const normalizedFolderPath = normalizeFolderPath(args.folderPath);

    const asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", normalizedFolderPath).eq("basename", args.basename),
      )
      .first();

    if (!asset) {
      return [];
    }

    const versions = await ctx.db
      .query("assetVersions")
      .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
      .order("asc")
      .collect();

    return versions;
  },
});

export const getPublishedVersion = query({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, args) => {
    const normalizedFolderPath = normalizeFolderPath(args.folderPath);

    // Find the asset
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", normalizedFolderPath).eq("basename", args.basename),
      )
      .first();

    if (!asset || !asset.publishedVersionId) {
      return null;
    }

    // Load the published version
    const publishedVersion = await ctx.db.get(asset.publishedVersionId);
    if (!publishedVersion) {
      return null;
    }

    return {
      folderPath: asset.folderPath,
      basename: asset.basename,
      version: publishedVersion.version,
      state: publishedVersion.state,
      createdAt: publishedVersion.createdAt,
      publishedAt: publishedVersion.publishedAt,
      createdBy: publishedVersion.createdBy,
      publishedBy: publishedVersion.publishedBy,
    };
  },
});

/**
 * Restore a previous version by creating a new version that references
 * the same storage file. This preserves full history:
 * v1 (initial) → v2 (newer) → v3 (restored from v1)
 */
export const restoreVersion = mutation({
  args: { versionId: v.id("assetVersions"), label: v.optional(v.string()) },
  returns: v.object({
    assetId: v.id("assets"),
    versionId: v.id("assetVersions"),
    version: v.number(),
    restoredFromVersion: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const actorFields = await getActorFields(ctx);

    // 1. Get the version to restore from
    const sourceVersion = await ctx.db.get(args.versionId);
    if (!sourceVersion) {
      throw new Error("Version not found");
    }
    if (!sourceVersion.storageId && !sourceVersion.r2Key) {
      throw new Error("Version has no associated file");
    }

    // 2. Get the asset
    const asset = await ctx.db.get(sourceVersion.assetId);
    if (!asset) {
      throw new Error("Asset not found");
    }

    // 3. Create new version with same storage reference
    const nextVersion = (asset.versionCounter ?? 0) + 1;
    const label = args.label ?? `Restored from v${sourceVersion.version}`;

    const newVersionId = await ctx.db.insert("assetVersions", {
      assetId: asset._id,
      version: nextVersion,
      state: "published",
      label,
      storageId: sourceVersion.storageId,
      r2Key: sourceVersion.r2Key,
      size: sourceVersion.size,
      contentType: sourceVersion.contentType,
      sha256: sourceVersion.sha256,
      createdAt: now,
      createdBy: actorFields.createdBy,
      publishedAt: now,
      publishedBy: actorFields.updatedBy,
      archivedAt: undefined,
      archivedBy: undefined,
    });

    // 4. Archive current published version if exists
    if (asset.publishedVersionId) {
      await ctx.db.patch(asset.publishedVersionId, {
        state: "archived",
        archivedAt: now,
        archivedBy: actorFields.updatedBy,
      });
    }

    // 5. Update asset pointers
    await ctx.db.patch(asset._id, {
      versionCounter: nextVersion,
      publishedVersionId: newVersionId,
      updatedAt: now,
      updatedBy: actorFields.updatedBy,
    });

    return {
      assetId: asset._id,
      versionId: newVersionId,
      version: nextVersion,
      restoredFromVersion: sourceVersion.version,
    };
  },
});

export const getPublishedFile = query({
  args: { folderPath: v.string(), basename: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      folderPath: v.string(),
      basename: v.string(),
      version: v.number(),
      state: v.literal("published"),
      storageId: v.optional(v.id("_storage")),
      r2Key: v.optional(v.string()),
      size: v.optional(v.number()),
      contentType: v.optional(v.string()),
      sha256: v.optional(v.string()),
      createdAt: v.number(),
      publishedAt: v.number(),
      createdBy: v.optional(v.string()),
      publishedBy: v.optional(v.string()),
      url: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const folderPath = normalizeFolderPath(args.folderPath);

    const asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", folderPath).eq("basename", args.basename),
      )
      .first();

    if (!asset || !asset.publishedVersionId) return null;

    const version = await ctx.db.get(asset.publishedVersionId);
    if (!version || version.state !== "published") {
      return null;
    }

    // Need either storageId (Convex) or r2Key (R2)
    if (!version.storageId && !version.r2Key) {
      return null;
    }

    // Get URL based on storage backend
    let url: string | null = null;
    if (version.r2Key) {
      url = await getR2PublicUrl(ctx, version.r2Key);
    } else if (version.storageId) {
      url = await ctx.storage.getUrl(version.storageId);
    }
    if (!url) return null;

    return {
      folderPath,
      basename: args.basename,
      version: version.version,
      state: "published" as const,
      storageId: version.storageId,
      r2Key: version.r2Key,
      size: version.size,
      contentType: version.contentType,
      sha256: version.sha256,
      createdAt: version.createdAt,
      publishedAt: version.publishedAt!,
      createdBy: version.createdBy,
      publishedBy: version.publishedBy,
      url,
    };
  },
});

export const listPublishedFilesInFolder = query({
  args: { folderPath: v.string() },
  returns: v.array(
    v.object({
      folderPath: v.string(),
      basename: v.string(),
      version: v.number(),
      versionId: v.id("assetVersions"),
      storageId: v.optional(v.id("_storage")),
      r2Key: v.optional(v.string()),
      url: v.string(),
      contentType: v.optional(v.string()),
      size: v.optional(v.number()),
      publishedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const folderPath = normalizeFolderPath(args.folderPath);

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) => q.eq("folderPath", folderPath))
      .collect();

    const assetPromises = assets.map(async (asset) => {
      if (!asset.publishedVersionId) return null;
      const version = await ctx.db.get(asset.publishedVersionId);
      if (!version || version.state !== "published") {
        return null;
      }

      // Need either storageId (Convex) or r2Key (R2)
      if (!version.storageId && !version.r2Key) {
        return null;
      }

      // Get URL based on storage backend
      let url: string | null = null;
      if (version.r2Key) {
        url = await getR2PublicUrl(ctx, version.r2Key);
      } else if (version.storageId) {
        url = await ctx.storage.getUrl(version.storageId);
      }
      if (!url) return null;
      return {
        folderPath,
        basename: asset.basename,
        version: version.version,
        versionId: asset.publishedVersionId,
        storageId: version.storageId,
        r2Key: version.r2Key,
        url,
        contentType: version.contentType,
        size: version.size,
        publishedAt: version.publishedAt,
      };
    });

    const assetResults = await Promise.all(assetPromises);
    return assetResults.filter((result) => result !== null);
  },
});

export const listPublishedAssetsInFolder = query({
  args: { folderPath: v.string() },
  returns: v.array(
    v.object({
      folderPath: v.string(),
      basename: v.string(),
      version: v.number(),
      label: v.optional(v.string()),
      createdAt: v.number(),
      publishedAt: v.optional(v.number()),
      createdBy: v.optional(v.string()),
      publishedBy: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const folderPath = normalizeFolderPath(args.folderPath);

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) => q.eq("folderPath", folderPath))
      .collect();

    const results: {
      folderPath: string;
      basename: string;
      version: number;
      label?: string;
      createdAt: number;
      publishedAt?: number;
      createdBy?: string;
      publishedBy?: string;
    }[] = [];

    for (const asset of assets) {
      if (!asset.publishedVersionId) continue;

      const version = await ctx.db.get(asset.publishedVersionId);
      if (!version || version.state !== "published") continue;

      results.push({
        folderPath,
        basename: asset.basename,
        version: version.version,
        label: version.label,
        createdAt: version.createdAt,
        publishedAt: version.publishedAt,
        createdBy: version.createdBy,
        publishedBy: version.publishedBy,
      });
    }

    return results;
  },
});

export const moveAsset = mutation({
  args: { fromFolderPath: v.string(), basename: v.string(), toFolderPath: v.string() },
  returns: v.object({
    assetId: v.id("assets"),
    fromFolderPath: v.string(),
    toFolderPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const from = normalizeFolderPath(args.fromFolderPath);
    const to = normalizeFolderPath(args.toFolderPath);
    const now = Date.now();
    const actorFields = await getActorFields(ctx);

    const asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", from).eq("basename", args.basename),
      )
      .first();

    if (!asset) {
      throw new Error(`Asset not found at ${from}/${args.basename}`);
    }

    // Check for conflict at destination
    const conflict = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) => q.eq("folderPath", to).eq("basename", args.basename))
      .first();

    if (conflict) {
      throw new Error(`Asset already exists at ${to}/${args.basename}`);
    }

    // Update asset location
    await ctx.db.patch(asset._id, {
      folderPath: to,
      updatedAt: now,
      updatedBy: actorFields.updatedBy,
    });

    // Log event
    await ctx.db.insert("assetEvents", {
      assetId: asset._id,
      type: "move",
      fromFolderPath: from,
      toFolderPath: to,
      createdAt: now,
      createdBy: actorFields.createdBy,
    });

    // Log for real-time sync
    await logChange(ctx, "asset:move", to, {
      basename: args.basename,
      oldFolderPath: from,
      performedBy: actorFields.updatedBy,
    });

    return { assetId: asset._id, fromFolderPath: from, toFolderPath: to };
  },
});

export const renameAsset = mutation({
  args: { folderPath: v.string(), basename: v.string(), newBasename: v.string() },
  returns: v.object({ assetId: v.id("assets"), oldBasename: v.string(), newBasename: v.string() }),
  handler: async (ctx, args) => {
    const folderPath = normalizeFolderPath(args.folderPath);
    const now = Date.now();
    const actorFields = await getActorFields(ctx);

    // Validate new basename doesn't contain slashes
    if (args.newBasename.includes("/")) {
      throw new Error("Basename cannot contain '/' characters");
    }

    // Find the asset to rename
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", folderPath).eq("basename", args.basename),
      )
      .first();

    if (!asset) {
      throw new Error(`Asset not found at ${folderPath}/${args.basename}`);
    }

    // Check for conflict with new basename
    const conflict = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", folderPath).eq("basename", args.newBasename),
      )
      .first();

    if (conflict) {
      throw new Error(`Asset already exists at ${folderPath}/${args.newBasename}`);
    }

    // Update asset basename
    await ctx.db.patch(asset._id, {
      basename: args.newBasename,
      updatedAt: now,
      updatedBy: actorFields.updatedBy,
    });

    // Log rename event
    await ctx.db.insert("assetEvents", {
      assetId: asset._id,
      type: "rename",
      fromBasename: args.basename,
      toBasename: args.newBasename,
      createdAt: now,
      createdBy: actorFields.createdBy,
    });

    // Log for real-time sync
    await logChange(ctx, "asset:rename", folderPath, {
      basename: args.newBasename,
      oldBasename: args.basename,
      performedBy: actorFields.updatedBy,
    });

    return { assetId: asset._id, oldBasename: args.basename, newBasename: args.newBasename };
  },
});

export const listAssetEvents = query({
  args: { folderPath: v.string(), basename: v.string() },
  returns: v.array(
    v.object({
      type: v.string(),
      fromFolderPath: v.optional(v.string()),
      toFolderPath: v.optional(v.string()),
      fromBasename: v.optional(v.string()),
      toBasename: v.optional(v.string()),
      createdAt: v.number(),
      createdBy: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const folderPath = normalizeFolderPath(args.folderPath);

    const asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", folderPath).eq("basename", args.basename),
      )
      .first();

    if (!asset) return [];

    const events = await ctx.db
      .query("assetEvents")
      .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
      .order("asc")
      .collect();

    return events.map((e) => ({
      type: e.type,
      fromFolderPath: e.fromFolderPath,
      toFolderPath: e.toFolderPath,
      fromBasename: e.fromBasename,
      toBasename: e.toBasename,
      createdAt: e.createdAt,
      createdBy: e.createdBy,
    }));
  },
});

/**
 * Delete a single file (asset and all its versions) by path.
 * Queues R2 keys for deferred deletion and logs to changelog.
 */
export const deleteFile = mutation({
  args: { folderPath: v.string(), basename: v.string() },
  returns: v.object({ deleted: v.boolean(), deletedVersions: v.number() }),
  handler: async (ctx, { folderPath, basename }) => {
    const normalizedPath = normalizeFolderPath(folderPath);
    const actorFields = await getActorFields(ctx);

    const asset = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", normalizedPath).eq("basename", basename),
      )
      .first();

    if (!asset) {
      return { deleted: false, deletedVersions: 0 };
    }

    let deletedVersions = 0;
    const originalPath = `${normalizedPath}/${basename}`;

    // Get and delete all versions, queue R2 keys for deletion
    const versions = await ctx.db
      .query("assetVersions")
      .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
      .collect();

    for (const version of versions) {
      if (version.r2Key) {
        await queueR2Deletion(ctx, version.r2Key, originalPath, actorFields.updatedBy);
      }
      await ctx.db.delete(version._id);
      deletedVersions++;
    }

    // Delete any events for this asset
    const events = await ctx.db
      .query("assetEvents")
      .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
      .collect();

    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    // Delete the asset itself
    await ctx.db.delete(asset._id);

    // Log to changelog
    await logChange(ctx, "asset:delete", normalizedPath, {
      basename,
      performedBy: actorFields.updatedBy,
    });

    return { deleted: true, deletedVersions };
  },
});

/**
 * Delete all files (assets and their versions) in a specific folder.
 * Does NOT delete the folder itself or subfolders.
 * Queues R2 keys for deferred deletion and logs to changelog.
 */
export const deleteFilesInFolder = mutation({
  args: {
    folderPath: v.string(),
    // Optional: only delete files matching these basenames (e.g., ["avatar-large.png", "avatar.webp"])
    basenames: v.optional(v.array(v.string())),
  },
  returns: v.object({ deletedAssets: v.number(), deletedVersions: v.number() }),
  handler: async (ctx, { folderPath, basenames }) => {
    const normalizedPath = normalizeFolderPath(folderPath);
    const actorFields = await getActorFields(ctx);
    let deletedAssets = 0;
    let deletedVersions = 0;

    // Get all assets in this folder
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_folder_basename", (q) => q.eq("folderPath", normalizedPath))
      .collect();

    for (const asset of assets) {
      // If basenames filter provided, skip assets that don't match
      if (basenames && !basenames.includes(asset.basename)) {
        continue;
      }

      const originalPath = `${normalizedPath}/${asset.basename}`;

      // Get and delete all versions, queue R2 keys for deletion
      const versions = await ctx.db
        .query("assetVersions")
        .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
        .collect();

      for (const version of versions) {
        if (version.r2Key) {
          await queueR2Deletion(ctx, version.r2Key, originalPath, actorFields.updatedBy);
        }
        await ctx.db.delete(version._id);
        deletedVersions++;
      }

      // Delete any events for this asset
      const events = await ctx.db
        .query("assetEvents")
        .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
        .collect();

      for (const event of events) {
        await ctx.db.delete(event._id);
      }

      // Delete the asset itself
      await ctx.db.delete(asset._id);
      deletedAssets++;

      // Log to changelog
      await logChange(ctx, "asset:delete", normalizedPath, {
        basename: asset.basename,
        performedBy: actorFields.updatedBy,
      });
    }

    return { deletedAssets, deletedVersions };
  },
});

/**
 * Delete a batch of data from asset-manager tables.
 * Call repeatedly until all data is deleted.
 * Used for development reset - does NOT delete files from R2/storage.
 */
export const deleteDataBatch = mutation({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({
    deletedFolders: v.number(),
    deletedAssets: v.number(),
    deletedVersions: v.number(),
    deletedEvents: v.number(),
    deletedIntents: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    let deletedVersions = 0;
    let deletedEvents = 0;
    let deletedAssets = 0;
    let deletedFolders = 0;
    let deletedIntents = 0;

    // Delete asset versions first (foreign key to assets)
    const versions = await ctx.db.query("assetVersions").take(batchSize);
    for (const v of versions) {
      await ctx.db.delete(v._id);
      deletedVersions++;
    }
    if (versions.length === batchSize) {
      return {
        deletedFolders,
        deletedAssets,
        deletedVersions,
        deletedEvents,
        deletedIntents,
        hasMore: true,
      };
    }

    // Delete asset events (foreign key to assets)
    const events = await ctx.db.query("assetEvents").take(batchSize);
    for (const e of events) {
      await ctx.db.delete(e._id);
      deletedEvents++;
    }
    if (events.length === batchSize) {
      return {
        deletedFolders,
        deletedAssets,
        deletedVersions,
        deletedEvents,
        deletedIntents,
        hasMore: true,
      };
    }

    // Delete assets (foreign key to folders)
    const assets = await ctx.db.query("assets").take(batchSize);
    for (const a of assets) {
      await ctx.db.delete(a._id);
      deletedAssets++;
    }
    if (assets.length === batchSize) {
      return {
        deletedFolders,
        deletedAssets,
        deletedVersions,
        deletedEvents,
        deletedIntents,
        hasMore: true,
      };
    }

    // Delete folders
    const folders = await ctx.db.query("folders").take(batchSize);
    for (const f of folders) {
      await ctx.db.delete(f._id);
      deletedFolders++;
    }
    if (folders.length === batchSize) {
      return {
        deletedFolders,
        deletedAssets,
        deletedVersions,
        deletedEvents,
        deletedIntents,
        hasMore: true,
      };
    }

    // Delete upload intents
    const intents = await ctx.db.query("uploadIntents").take(batchSize);
    for (const i of intents) {
      await ctx.db.delete(i._id);
      deletedIntents++;
    }

    return {
      deletedFolders,
      deletedAssets,
      deletedVersions,
      deletedEvents,
      deletedIntents,
      hasMore: intents.length === batchSize,
    };
  },
});

const PATH_SUFFIX = "\uffff";

export const getR2KeysByPathPrefix = query({
  args: { pathPrefix: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const prefix = normalizeFolderPath(args.pathPrefix);
    const childPrefix = `${prefix}/`;
    const end = `${childPrefix}${PATH_SUFFIX}`;
    const r2Keys: string[] = [];

    const mainFolder = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.eq("path", prefix))
      .first();

    const childFolders = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.gte("path", childPrefix).lt("path", end))
      .collect();

    const allFolders = [...(mainFolder ? [mainFolder] : []), ...childFolders];

    for (const folder of allFolders) {
      const assets = await ctx.db
        .query("assets")
        .withIndex("by_folder_basename", (q) => q.eq("folderPath", folder.path))
        .collect();

      for (const asset of assets) {
        const versions = await ctx.db
          .query("assetVersions")
          .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
          .collect();

        for (const version of versions) {
          if (version.r2Key) {
            r2Keys.push(version.r2Key);
          }
        }
      }
    }

    return r2Keys;
  },
});

export const deleteByPathPrefixBatch = mutation({
  args: { pathPrefix: v.string(), batchSize: v.optional(v.number()) },
  returns: v.object({
    deletedFolders: v.number(),
    deletedAssets: v.number(),
    deletedVersions: v.number(),
    deletedEvents: v.number(),
    r2KeysToDelete: v.array(v.string()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const prefix = normalizeFolderPath(args.pathPrefix);
    const childPrefix = `${prefix}/`;
    const end = `${childPrefix}${PATH_SUFFIX}`;

    let deletedVersions = 0;
    let deletedEvents = 0;
    let deletedAssets = 0;
    let deletedFolders = 0;
    const r2KeysToDelete: string[] = [];

    const mainFolder = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.eq("path", prefix))
      .first();

    const childFolders = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.gte("path", childPrefix).lt("path", end))
      .collect();

    const allFolders = [...(mainFolder ? [mainFolder] : []), ...childFolders];
    const folderPaths = allFolders.map((f) => f.path);

    for (const folderPath of folderPaths) {
      const assets = await ctx.db
        .query("assets")
        .withIndex("by_folder_basename", (q) => q.eq("folderPath", folderPath))
        .take(batchSize);

      for (const asset of assets) {
        const versions = await ctx.db
          .query("assetVersions")
          .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
          .collect();

        for (const version of versions) {
          if (version.r2Key) {
            r2KeysToDelete.push(version.r2Key);
          }
          await ctx.db.delete(version._id);
          deletedVersions++;
        }

        const events = await ctx.db
          .query("assetEvents")
          .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
          .collect();

        for (const event of events) {
          await ctx.db.delete(event._id);
          deletedEvents++;
        }

        await ctx.db.delete(asset._id);
        deletedAssets++;
      }

      if (assets.length === batchSize) {
        return {
          deletedFolders,
          deletedAssets,
          deletedVersions,
          deletedEvents,
          r2KeysToDelete,
          hasMore: true,
        };
      }
    }

    for (const folder of allFolders) {
      await ctx.db.delete(folder._id);
      deletedFolders++;
    }

    return {
      deletedFolders,
      deletedAssets,
      deletedVersions,
      deletedEvents,
      r2KeysToDelete,
      hasMore: false,
    };
  },
});

// =============================================================================
// R2 Soft-Delete Management
// =============================================================================

/**
 * List pending R2 deletions (for debugging/admin).
 */
export const listPendingR2Deletions = query({
  args: { limit: v.optional(v.number()), onlyExpired: v.optional(v.boolean()) },
  returns: v.array(
    v.object({
      _id: v.id("pendingR2Deletions"),
      _creationTime: v.number(),
      r2Key: v.string(),
      originalPath: v.string(),
      deletedAt: v.number(),
      deleteAfter: v.number(),
      deletedBy: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit ?? 100;

    if (args.onlyExpired) {
      return await ctx.db
        .query("pendingR2Deletions")
        .withIndex("by_delete_after", (q) => q.lte("deleteAfter", now))
        .take(limit);
    }

    return await ctx.db.query("pendingR2Deletions").take(limit);
  },
});

/**
 * Process expired R2 deletions and return keys that should be deleted from R2.
 * Call this from a cron job or cleanup script.
 * The caller is responsible for actually deleting the files from R2.
 */
export const processExpiredR2Deletions = mutation({
  args: {
    batchSize: v.optional(v.number()),
    // If true, process ALL pending deletions regardless of deleteAfter time
    forceAll: v.optional(v.boolean()),
  },
  returns: v.object({
    processed: v.number(),
    r2KeysToDelete: v.array(v.string()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const batchSize = args.batchSize ?? 100;

    let batch;
    if (args.forceAll) {
      batch = await ctx.db.query("pendingR2Deletions").take(batchSize);
    } else {
      batch = await ctx.db
        .query("pendingR2Deletions")
        .withIndex("by_delete_after", (q) => q.lte("deleteAfter", now))
        .take(batchSize);
    }

    const r2KeysToDelete: string[] = [];
    for (const deletion of batch) {
      r2KeysToDelete.push(deletion.r2Key);
      await ctx.db.delete(deletion._id);
    }

    return { processed: batch.length, r2KeysToDelete, hasMore: batch.length === batchSize };
  },
});

/**
 * Cancel a pending R2 deletion (restore before hard-delete).
 * Returns true if the deletion was found and cancelled.
 */
export const cancelPendingR2Deletion = mutation({
  args: { r2Key: v.string() },
  returns: v.object({ cancelled: v.boolean() }),
  handler: async (ctx, { r2Key }) => {
    const pending = await ctx.db
      .query("pendingR2Deletions")
      .withIndex("by_r2_key", (q) => q.eq("r2Key", r2Key))
      .first();

    if (!pending) {
      return { cancelled: false };
    }

    await ctx.db.delete(pending._id);
    return { cancelled: true };
  },
});
