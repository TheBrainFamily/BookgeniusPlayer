// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./test.setup";

describe("R2 soft-delete management", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  describe("deleteFile", () => {
    it("deletes a file and queues R2 key for deletion", async () => {
      // Create an asset with an R2-backed version
      const storageId = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 1000,
        contentType: "image/png",
      });

      await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "test-book/characters",
        basename: "hero.png",
        storageId,
      });

      // Verify asset exists
      let asset = await t.query(api.assetManager.getAsset, {
        folderPath: "test-book/characters",
        basename: "hero.png",
      });
      expect(asset).not.toBeNull();

      // Delete the file
      const result = await t.mutation(api.assetManager.deleteFile, {
        folderPath: "test-book/characters",
        basename: "hero.png",
      });

      expect(result.deleted).toBe(true);
      expect(result.deletedVersions).toBe(1);

      // Verify asset is gone
      asset = await t.query(api.assetManager.getAsset, {
        folderPath: "test-book/characters",
        basename: "hero.png",
      });
      expect(asset).toBeNull();
    });

    it("returns deleted: false for non-existent file", async () => {
      const result = await t.mutation(api.assetManager.deleteFile, {
        folderPath: "non-existent",
        basename: "file.png",
      });

      expect(result.deleted).toBe(false);
      expect(result.deletedVersions).toBe(0);
    });
  });

  describe("deleteFilesInFolder", () => {
    it("deletes all files in a folder", async () => {
      // Create multiple assets
      const storageId1 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 1000,
        contentType: "image/png",
      });
      const storageId2 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 2000,
        contentType: "image/png",
      });

      await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "test-book/backgrounds",
        basename: "bg1.png",
        storageId: storageId1,
      });

      await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "test-book/backgrounds",
        basename: "bg2.png",
        storageId: storageId2,
      });

      // Delete all files in folder
      const result = await t.mutation(api.assetManager.deleteFilesInFolder, {
        folderPath: "test-book/backgrounds",
      });

      expect(result.deletedAssets).toBe(2);
      expect(result.deletedVersions).toBe(2);

      // Verify both assets are gone
      const asset1 = await t.query(api.assetManager.getAsset, {
        folderPath: "test-book/backgrounds",
        basename: "bg1.png",
      });
      const asset2 = await t.query(api.assetManager.getAsset, {
        folderPath: "test-book/backgrounds",
        basename: "bg2.png",
      });

      expect(asset1).toBeNull();
      expect(asset2).toBeNull();
    });

    it("filters by basenames when provided", async () => {
      const storageId1 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 1000,
        contentType: "image/png",
      });
      const storageId2 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 2000,
        contentType: "image/png",
      });

      await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "test-book/mixed",
        basename: "keep.png",
        storageId: storageId1,
      });

      await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "test-book/mixed",
        basename: "delete.png",
        storageId: storageId2,
      });

      // Delete only specific file
      const result = await t.mutation(api.assetManager.deleteFilesInFolder, {
        folderPath: "test-book/mixed",
        basenames: ["delete.png"],
      });

      expect(result.deletedAssets).toBe(1);

      // Verify only the specified file was deleted
      const kept = await t.query(api.assetManager.getAsset, {
        folderPath: "test-book/mixed",
        basename: "keep.png",
      });
      const deleted = await t.query(api.assetManager.getAsset, {
        folderPath: "test-book/mixed",
        basename: "delete.png",
      });

      expect(kept).not.toBeNull();
      expect(deleted).toBeNull();
    });
  });

  describe("listPendingR2Deletions", () => {
    it("returns empty array when no deletions pending", async () => {
      const result = await t.query(api.assetManager.listPendingR2Deletions, {});
      expect(result).toEqual([]);
    });

    it("returns pending deletions with correct shape", async () => {
      // Insert a pending deletion directly
      await t.run(async (ctx) => {
        await ctx.db.insert("pendingR2Deletions", {
          r2Key: "test/key.png",
          originalPath: "folder/file.png",
          deletedAt: Date.now(),
          deleteAfter: Date.now() + 1000 * 60 * 60 * 24 * 30,
          deletedBy: "test-user",
        });
      });

      const result = await t.query(api.assetManager.listPendingR2Deletions, {});

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        r2Key: "test/key.png",
        originalPath: "folder/file.png",
        deletedBy: "test-user",
      });
      expect(result[0]._id).toBeDefined();
      expect(result[0]._creationTime).toBeDefined();
      expect(result[0].deletedAt).toBeGreaterThan(0);
      expect(result[0].deleteAfter).toBeGreaterThan(result[0].deletedAt);
    });

    it("filters by expiration when onlyExpired is true", async () => {
      const now = Date.now();

      await t.run(async (ctx) => {
        // Expired deletion
        await ctx.db.insert("pendingR2Deletions", {
          r2Key: "expired/key.png",
          originalPath: "expired.png",
          deletedAt: now - 1000 * 60 * 60 * 24 * 31,
          deleteAfter: now - 1000, // Already passed
        });

        // Not yet expired
        await ctx.db.insert("pendingR2Deletions", {
          r2Key: "pending/key.png",
          originalPath: "pending.png",
          deletedAt: now,
          deleteAfter: now + 1000 * 60 * 60 * 24 * 30,
        });
      });

      const allResults = await t.query(api.assetManager.listPendingR2Deletions, {});
      expect(allResults).toHaveLength(2);

      const expiredResults = await t.query(api.assetManager.listPendingR2Deletions, {
        onlyExpired: true,
      });
      expect(expiredResults).toHaveLength(1);
      expect(expiredResults[0].r2Key).toBe("expired/key.png");
    });
  });

  describe("processExpiredR2Deletions", () => {
    it("processes only expired deletions by default", async () => {
      const now = Date.now();

      await t.run(async (ctx) => {
        // Expired
        await ctx.db.insert("pendingR2Deletions", {
          r2Key: "expired1.png",
          originalPath: "expired1.png",
          deletedAt: now - 1000,
          deleteAfter: now - 1,
        });
        await ctx.db.insert("pendingR2Deletions", {
          r2Key: "expired2.png",
          originalPath: "expired2.png",
          deletedAt: now - 1000,
          deleteAfter: now - 1,
        });
        // Not expired
        await ctx.db.insert("pendingR2Deletions", {
          r2Key: "pending.png",
          originalPath: "pending.png",
          deletedAt: now,
          deleteAfter: now + 1000 * 60 * 60 * 24 * 30,
        });
      });

      const result = await t.mutation(api.assetManager.processExpiredR2Deletions, {});

      expect(result.processed).toBe(2);
      expect(result.r2KeysToDelete).toContain("expired1.png");
      expect(result.r2KeysToDelete).toContain("expired2.png");
      expect(result.r2KeysToDelete).not.toContain("pending.png");

      // Verify the pending one is still there
      const remaining = await t.query(api.assetManager.listPendingR2Deletions, {});
      expect(remaining).toHaveLength(1);
      expect(remaining[0].r2Key).toBe("pending.png");
    });

    it("processes all deletions when forceAll is true", async () => {
      const now = Date.now();

      await t.run(async (ctx) => {
        // Not expired, but will be processed with forceAll
        await ctx.db.insert("pendingR2Deletions", {
          r2Key: "pending1.png",
          originalPath: "pending1.png",
          deletedAt: now,
          deleteAfter: now + 1000 * 60 * 60 * 24 * 30,
        });
        await ctx.db.insert("pendingR2Deletions", {
          r2Key: "pending2.png",
          originalPath: "pending2.png",
          deletedAt: now,
          deleteAfter: now + 1000 * 60 * 60 * 24 * 30,
        });
      });

      const result = await t.mutation(api.assetManager.processExpiredR2Deletions, {
        forceAll: true,
      });

      expect(result.processed).toBe(2);
      expect(result.r2KeysToDelete).toHaveLength(2);

      const remaining = await t.query(api.assetManager.listPendingR2Deletions, {});
      expect(remaining).toHaveLength(0);
    });

    it("returns hasMore when batch limit reached", async () => {
      const now = Date.now();

      await t.run(async (ctx) => {
        for (let i = 0; i < 5; i++) {
          await ctx.db.insert("pendingR2Deletions", {
            r2Key: `key${i}.png`,
            originalPath: `path${i}.png`,
            deletedAt: now - 1000,
            deleteAfter: now - 1,
          });
        }
      });

      const result = await t.mutation(api.assetManager.processExpiredR2Deletions, { batchSize: 3 });

      expect(result.processed).toBe(3);
      expect(result.hasMore).toBe(true);

      const remaining = await t.query(api.assetManager.listPendingR2Deletions, {});
      expect(remaining).toHaveLength(2);
    });
  });

  describe("cancelPendingR2Deletion", () => {
    it("cancels an existing pending deletion", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert("pendingR2Deletions", {
          r2Key: "cancel-me.png",
          originalPath: "to-cancel.png",
          deletedAt: Date.now(),
          deleteAfter: Date.now() + 1000 * 60 * 60 * 24 * 30,
        });
      });

      const result = await t.mutation(api.assetManager.cancelPendingR2Deletion, {
        r2Key: "cancel-me.png",
      });

      expect(result.cancelled).toBe(true);

      const remaining = await t.query(api.assetManager.listPendingR2Deletions, {});
      expect(remaining).toHaveLength(0);
    });

    it("returns cancelled: false for non-existent key", async () => {
      const result = await t.mutation(api.assetManager.cancelPendingR2Deletion, {
        r2Key: "non-existent.png",
      });

      expect(result.cancelled).toBe(false);
    });
  });
});
