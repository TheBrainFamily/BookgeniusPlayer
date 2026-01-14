// @vitest-environment node
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./test.setup";

describe("changelog: real-time sync", () => {
  describe("folder operations", () => {
    it("createFolderByPath logs folder:create to changelog", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.assetManager.createFolderByPath, { path: "test-folder" });

      // Check changelog entry was created
      const changes = await t.query(api.changelog.listSince, { cursor: { createdAt: 0, id: "" } });
      expect(changes.changes).toHaveLength(1);
      expect(changes.changes[0].changeType).toBe("folder:create");
      expect(changes.changes[0].folderPath).toBe("test-folder");
    });

    it("createFolderByName logs folder:create to changelog", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.assetManager.createFolderByName, {
        parentPath: "",
        name: "Test Folder",
      });

      const changes = await t.query(api.changelog.listSince, { cursor: { createdAt: 0, id: "" } });
      expect(changes.changes).toHaveLength(1);
      expect(changes.changes[0].changeType).toBe("folder:create");
      expect(changes.changes[0].folderPath).toBe("test-folder"); // slugified
    });

    it("updateFolder logs folder:update to changelog", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.assetManager.createFolderByPath, {
        path: "my-folder",
        name: "Original Name",
      });

      await t.mutation(api.assetManager.updateFolder, { path: "my-folder", name: "Updated Name" });

      const changes = await t.query(api.changelog.listSince, { cursor: { createdAt: 0, id: "" } });
      expect(changes.changes).toHaveLength(2);
      expect(changes.changes[0].changeType).toBe("folder:create");
      expect(changes.changes[1].changeType).toBe("folder:update");
      expect(changes.changes[1].folderPath).toBe("my-folder");
    });
  });

  describe("changelog queries", () => {
    it("listSince returns changes after cursor", async () => {
      const t = convexTest(schema, modules);

      // Create first folder
      await t.mutation(api.assetManager.createFolderByPath, { path: "folder1" });

      // Get all changes and verify we have one
      const allChanges = await t.query(api.changelog.listSince, {
        cursor: { createdAt: 0, id: "" },
      });
      expect(allChanges.changes).toHaveLength(1);

      // Verify cursor is now a compound cursor with createdAt > 0
      expect(typeof allChanges.nextCursor).toBe("object");
      expect((allChanges.nextCursor as { createdAt: number }).createdAt).toBeGreaterThan(0);

      // Create second folder
      await t.mutation(api.assetManager.createFolderByPath, { path: "folder2" });

      // Query all changes - should have 2 now
      const allChangesAfter = await t.query(api.changelog.listSince, {
        cursor: { createdAt: 0, id: "" },
      });
      expect(allChangesAfter.changes).toHaveLength(2);

      // Verify the cursor advances with each change (compare createdAt values)
      const firstCursor = allChanges.nextCursor as { createdAt: number; id: string };
      const secondCursor = allChangesAfter.nextCursor as { createdAt: number; id: string };
      expect(secondCursor.createdAt).toBeGreaterThanOrEqual(firstCursor.createdAt);
    });

    it("listForFolder returns changes for specific folder only", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(api.assetManager.createFolderByPath, { path: "folder-a" });
      await t.mutation(api.assetManager.createFolderByPath, { path: "folder-b" });

      const changesA = await t.query(api.changelog.listForFolder, {
        folderPath: "folder-a",
        cursor: { createdAt: 0, id: "" },
      });
      expect(changesA.changes).toHaveLength(1);
      expect(changesA.changes[0].folderPath).toBe("folder-a");

      const changesB = await t.query(api.changelog.listForFolder, {
        folderPath: "folder-b",
        cursor: { createdAt: 0, id: "" },
      });
      expect(changesB.changes).toHaveLength(1);
      expect(changesB.changes[0].folderPath).toBe("folder-b");
    });

    it("listSince respects limit parameter", async () => {
      const t = convexTest(schema, modules);

      // Create multiple folders
      await t.mutation(api.assetManager.createFolderByPath, { path: "f1" });
      await t.mutation(api.assetManager.createFolderByPath, { path: "f2" });
      await t.mutation(api.assetManager.createFolderByPath, { path: "f3" });

      const changes = await t.query(api.changelog.listSince, {
        cursor: { createdAt: 0, id: "" },
        limit: 2,
      });
      expect(changes.changes).toHaveLength(2);
    });
  });

  describe("asset operations", () => {
    it("moveAsset logs asset:move with old and new paths", async () => {
      const t = convexTest(schema, modules);

      // Create an asset first
      await t.mutation(api.assetManager.createAsset, {
        folderPath: "source",
        basename: "file.txt",
      });

      // Move it (uses fromFolderPath/toFolderPath)
      await t.mutation(api.assetManager.moveAsset, {
        fromFolderPath: "source",
        basename: "file.txt",
        toFolderPath: "dest",
      });

      const changes = await t.query(api.changelog.listSince, { cursor: { createdAt: 0, id: "" } });
      const moveChange = changes.changes.find((c) => c.changeType === "asset:move");
      expect(moveChange).toBeDefined();
      expect(moveChange?.folderPath).toBe("dest");
      expect(moveChange?.oldFolderPath).toBe("source");
      expect(moveChange?.basename).toBe("file.txt");
    });

    it("renameAsset logs asset:rename with old and new basenames", async () => {
      const t = convexTest(schema, modules);

      // Create an asset first
      await t.mutation(api.assetManager.createAsset, {
        folderPath: "docs",
        basename: "old-name.txt",
      });

      // Rename it
      await t.mutation(api.assetManager.renameAsset, {
        folderPath: "docs",
        basename: "old-name.txt",
        newBasename: "new-name.txt",
      });

      const changes = await t.query(api.changelog.listSince, { cursor: { createdAt: 0, id: "" } });
      const renameChange = changes.changes.find((c) => c.changeType === "asset:rename");
      expect(renameChange).toBeDefined();
      expect(renameChange?.folderPath).toBe("docs");
      expect(renameChange?.basename).toBe("new-name.txt");
      expect(renameChange?.oldBasename).toBe("old-name.txt");
    });

    it("createVersionFromStorageId logs asset:publish", async () => {
      const t = convexTest(schema, modules);

      // Insert fake file metadata into _storage for testing
      const storageId = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
        size: 1234,
        contentType: "image/png",
      });

      await t.mutation(api.assetManager.createVersionFromStorageId, {
        folderPath: "images",
        basename: "photo.png",
        storageId,
      });

      const changes = await t.query(api.changelog.listSince, { cursor: { createdAt: 0, id: "" } });
      const publishChange = changes.changes.find((c) => c.changeType === "asset:publish");
      expect(publishChange).toBeDefined();
      expect(publishChange?.folderPath).toBe("images");
      expect(publishChange?.basename).toBe("photo.png");
    });
  });
});
