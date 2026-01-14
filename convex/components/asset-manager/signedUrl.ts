import { action } from "./_generated/server";
import { anyApi } from "convex/server";
import { v } from "convex/values";
import { createR2Client } from "./r2Client";
import { type Id } from "./_generated/dataModel";

// Use anyApi to avoid circular type references when calling internal queries
// from actions in the same component
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: fix this, need to look into the circular dependency
const internal = anyApi as { internalQueries: { getVersionStorageInfo: any } };

// Validator for R2 config passed from app layer
const r2ConfigValidator = v.object({
  R2_BUCKET: v.string(),
  R2_ENDPOINT: v.string(),
  R2_ACCESS_KEY_ID: v.string(),
  R2_SECRET_ACCESS_KEY: v.string(),
});

// =============================================================================
// Storage Type Helpers
// =============================================================================

interface StorageReference {
  storageId?: Id<"_storage">;
  r2Key?: string;
}

function isStoredOnConvex(
  ref: StorageReference,
): ref is StorageReference & { storageId: Id<"_storage"> } {
  return ref.storageId !== undefined;
}

function isStoredOnR2(ref: StorageReference): ref is StorageReference & { r2Key: string } {
  return ref.r2Key !== undefined;
}

// =============================================================================
// Signed URL Generation (for private file access)
// =============================================================================

/**
 * Generate a signed URL for private file access.
 * Works with both Convex storage and R2.
 *
 * For Convex storage: Returns storage URL (already time-limited ~1hr)
 * For R2: Generates signed URL with custom expiration
 *
 * NOTE: This does NOT check auth - that's the app's responsibility.
 * The app should check permissions before calling this.
 *
 * For audio/video files, use longer expiration (e.g., 3600 = 1 hour)
 * to handle seeking and buffering during playback.
 */
export const getSignedUrl = action({
  args: {
    versionId: v.id("assetVersions"),
    expiresIn: v.optional(v.number()), // seconds, default 300 (5 min)
    r2Config: v.optional(r2ConfigValidator),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { versionId, expiresIn = 300, r2Config }) => {
    const version = await ctx.runQuery(internal.internalQueries.getVersionStorageInfo, {
      versionId,
    });
    if (!version) return null;

    if (isStoredOnConvex(version)) {
      // Convex storage URLs are already time-limited (~1hr)
      return await ctx.storage.getUrl(version.storageId);
    }

    if (isStoredOnR2(version)) {
      if (!r2Config) {
        throw new Error("r2Config is required for R2-stored files");
      }
      const r2 = createR2Client(r2Config);
      return await r2.getUrl(version.r2Key, { expiresIn });
    }

    return null;
  },
});
