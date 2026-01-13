// @vitest-environment node
// convex/components/asset-manager/assetFsHttp.test.ts
/**
 * Tests for HTTP file serving functionality.
 *
 * This module handles serving asset versions over HTTP with intelligent caching:
 * - Small files (≤20MB): Served as blobs with immutable caching (1 year)
 * - Large files (>20MB): Served via redirect to storage URL with short caching (60s)
 * - Any version with storage is served (published, archived)
 * - Version IDs are opaque UUIDs - knowing the ID is sufficient authorization
 */
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./test.setup";

describe("getVersionPreviewUrl (admin preview - any version state)", () => {
  it("returns URL for archived versions (for admin preview)", async () => {
    const t = convexTest(schema, modules);

    // Create two versions - the first will be archived when second is published
    const s1 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
      size: 100,
      contentType: "image/png",
    });
    const s2 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
      size: 200,
      contentType: "image/png",
    });

    const v1 = await t.mutation(api.assetManager.createVersionFromStorageId, {
      folderPath: "",
      basename: "preview-test.png",
      storageId: s1,
    });

    // Publishing v2 archives v1
    await t.mutation(api.assetManager.createVersionFromStorageId, {
      folderPath: "",
      basename: "preview-test.png",
      storageId: s2,
    });

    // Verify v1 is archived
    const versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "",
      basename: "preview-test.png",
    });
    const archivedV1 = versions.find((v) => v._id === v1.versionId);
    expect(archivedV1?.state).toBe("archived");

    // v1 is archived - but admin preview should still return URL
    const result = await t.query(api.assetFsHttp.getVersionPreviewUrl, { versionId: v1.versionId });

    expect(result).not.toBeNull();
    expect(result?.url).toBeDefined();
    expect(typeof result?.url).toBe("string");
    expect((result?.url ?? "").length).toBeGreaterThan(0);
  });

  it("returns URL for published versions", async () => {
    const t = convexTest(schema, modules);

    const storageId = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
      size: 100,
      contentType: "text/plain",
    });

    const { versionId } = await t.mutation(api.assetManager.createVersionFromStorageId, {
      folderPath: "",
      basename: "published-preview.txt",
      storageId,
    });

    const result = await t.query(api.assetFsHttp.getVersionPreviewUrl, { versionId });

    expect(result).not.toBeNull();
    expect(result?.url).toBeDefined();
    expect((result?.url ?? "").length).toBeGreaterThan(0);
  });

  it("returns null for version without storage", async () => {
    const t = convexTest(schema, modules);

    // Create a version without storage (using commitVersion, not commitUpload)
    const { versionId } = await t.mutation(api.assetManager.commitVersion, {
      folderPath: "",
      basename: "no-storage.txt",
    });

    const result = await t.query(api.assetFsHttp.getVersionPreviewUrl, { versionId });

    // Should return null because there's no storageId
    expect(result).toBeNull();
  });
});

describe("getVersionForServing (HTTP file serving logic)", () => {
  describe("access - any version with storage is served", () => {
    it("serves archived versions (old links should not break)", async () => {
      const t = convexTest(schema, modules);

      // Create two versions - the first will be archived when second is published
      const s1 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 100,
        contentType: "text/plain",
      });
      const s2 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 200,
        contentType: "text/plain",
      });

      const v1 = await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "",
        basename: "doc.txt",
        storageId: s1,
      });

      // Publishing v2 archives v1
      await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "",
        basename: "doc.txt",
        storageId: s2,
      });

      // v1 is now archived - should STILL be servable
      const result = await t.query(api.assetFsHttp.getVersionForServing, {
        versionId: v1.versionId,
      });

      expect(result).not.toBeNull();
      expect(result?.storageId).toEqual(s1);
    });

    it("serves published versions", async () => {
      const t = convexTest(schema, modules);

      const storageId = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 100,
        contentType: "application/json",
      });

      const { versionId } = await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "api",
        basename: "config.json",
        storageId,
      });

      const result = await t.query(api.assetFsHttp.getVersionForServing, { versionId });

      expect(result).not.toBeNull();
      expect(result?.storageId).toEqual(storageId);
    });

    it("returns null for versions without storage", async () => {
      const t = convexTest(schema, modules);

      // Create version without storage (commitVersion, not commitUpload)
      const { versionId } = await t.mutation(api.assetManager.commitVersion, {
        folderPath: "",
        basename: "no-file.txt",
      });

      const result = await t.query(api.assetFsHttp.getVersionForServing, { versionId });

      expect(result).toBeNull();
    });
  });

  describe("caching strategy - small vs large files", () => {
    it("small files (≤20MB) are served as blobs with immutable caching", async () => {
      const t = convexTest(schema, modules);

      // Create a small file (100 bytes, well under 20MB limit)
      const storageId = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 100,
        contentType: "image/png",
      });

      const { versionId } = await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "images",
        basename: "icon.png",
        storageId,
      });

      const result = await t.query(api.assetFsHttp.getVersionForServing, { versionId });

      // Small files return blob response for direct serving
      expect(result?.kind).toBe("blob");
      expect(result?.storageId).toEqual(storageId);
      // contentType is set (defaults to octet-stream if not preserved by storage)
      expect(result?.contentType).toBeDefined();

      // Immutable caching for 1 year - file content is versioned so it never changes
      expect(result?.cacheControl).toBe("public, max-age=31536000, immutable");
    });

    it("large files (>20MB) are served via redirect with short caching", async () => {
      const t = convexTest(schema, modules);

      // Create a large file (25MB, over 20MB limit)
      const largeSize = 25 * 1024 * 1024; // 25MB
      const storageId = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: largeSize,
        contentType: "video/mp4",
      });

      const { versionId } = await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "videos",
        basename: "intro.mp4",
        storageId,
      });

      const result = await t.query(api.assetFsHttp.getVersionForServing, { versionId });

      // Large files return redirect to storage URL
      expect(result?.kind).toBe("redirect");
      expect(result?.location).toBeDefined();
      expect(typeof result?.location).toBe("string");
      expect((result?.location ?? "").length).toBeGreaterThan(0);

      // Short caching because storage URLs expire
      expect(result?.cacheControl).toBe("public, max-age=60");
    });

    it("files at exactly 20MB boundary are served as blobs", async () => {
      const t = convexTest(schema, modules);

      // Exactly 20MB - should be treated as small
      const exactLimit = 20 * 1024 * 1024;
      const storageId = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: exactLimit,
        contentType: "application/zip",
      });

      const { versionId } = await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "archives",
        basename: "data.zip",
        storageId,
      });

      const result = await t.query(api.assetFsHttp.getVersionForServing, { versionId });

      expect(result?.kind).toBe("blob");
    });

    it("files just over 20MB boundary are served via redirect", async () => {
      const t = convexTest(schema, modules);

      // Just over 20MB - should be treated as large
      const justOver = 20 * 1024 * 1024 + 1;
      const storageId = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: justOver,
        contentType: "application/zip",
      });

      const { versionId } = await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "archives",
        basename: "big-data.zip",
        storageId,
      });

      const result = await t.query(api.assetFsHttp.getVersionForServing, { versionId });

      expect(result?.kind).toBe("redirect");
    });
  });

  describe("content type handling", () => {
    it("always includes a content type in the response", async () => {
      const t = convexTest(schema, modules);

      const storageId = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 500,
        contentType: "application/pdf",
      });

      const { versionId } = await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "docs",
        basename: "report.pdf",
        storageId,
      });

      const result = await t.query(api.assetFsHttp.getVersionForServing, { versionId });

      expect(result?.kind).toBe("blob");
      // Content type is always present (from storage metadata or defaults to octet-stream)
      expect(result?.contentType).toBeDefined();
      expect(typeof result?.contentType).toBe("string");
    });

    it("defaults to application/octet-stream when content type is not available", async () => {
      const t = convexTest(schema, modules);

      // Create file - storage may or may not preserve contentType
      const storageId = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 100,
      });

      const { versionId } = await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "misc",
        basename: "unknown.bin",
        storageId,
      });

      const result = await t.query(api.assetFsHttp.getVersionForServing, { versionId });

      expect(result?.kind).toBe("blob");
      // Falls back to octet-stream when no contentType is available
      expect(result?.contentType).toBe("application/octet-stream");
    });
  });
});
