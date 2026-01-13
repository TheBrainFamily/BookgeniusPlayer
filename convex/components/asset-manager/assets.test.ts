import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

describe("assets (logical layer)", () => {
  it("createAsset creates an asset at root with normalized folderPath and versionCounter=0", async () => {
    const t = convexTest(schema, modules);

    const assetId = await t.mutation(api.assetManager.createAsset, {
      folderPath: "", // root
      basename: "cover.jpg",
    });

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "cover.jpg",
    });

    expect(asset?._id).toEqual(assetId);
    expect(asset?.folderPath).toBe(""); // normalized root
    expect(asset?.basename).toBe("cover.jpg");
    expect(asset?.versionCounter).toBe(0);

    expect(asset?.createdAt).toBeGreaterThan(0);
    expect(asset?.updatedAt).toBe(asset?.createdAt);

    // createdBy / updatedBy are driven by getActorFields(ctx).
    // For this test environment they might be undefined,
    // but they should be consistent with each other.
    expect(asset?.createdBy ?? null).toBe(asset?.updatedBy ?? null);
  });

  it("createAsset normalizes folderPath like folders do", async () => {
    const t = convexTest(schema, modules);

    const assetId = await t.mutation(api.assetManager.createAsset, {
      folderPath: "  kanban/backlog/  ",
      basename: "todo-1.json",
    });

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "kanban/backlog",
      basename: "todo-1.json",
    });

    expect(asset?._id).toEqual(assetId);
    expect(asset?.folderPath).toBe("kanban/backlog");
    expect(asset?.basename).toBe("todo-1.json");
  });

  it("createAsset throws on duplicate (same folderPath + basename)", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createAsset, { folderPath: "", basename: "cover.jpg" });

    await expect(
      t.mutation(api.assetManager.createAsset, {
        folderPath: " / ", // different formatting, same normalized folderPath
        basename: "cover.jpg",
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("getAsset returns null when asset does not exist", async () => {
    const t = convexTest(schema, modules);

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "does-not-exist.txt",
    });

    expect(asset).toBeNull();
  });

  it("getAsset includes publishedVersionId when asset has a published version", async () => {
    const t = convexTest(schema, modules);

    // Create asset
    await t.mutation(api.assetManager.createAsset, {
      folderPath: "",
      basename: "test-published.txt",
    });

    // Commit a version
    const result = await t.mutation(api.assetManager.commitVersion, {
      folderPath: "",
      basename: "test-published.txt",
      label: "v1",
    });

    // Get the asset and verify publishedVersionId is included
    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "test-published.txt",
    });

    expect(asset).not.toBeNull();
    expect(asset?.publishedVersionId).toBe(result.versionId);
  });

  it("listAssets returns assets only for the given folderPath", async () => {
    const t = convexTest(schema, modules);

    // root assets
    await t.mutation(api.assetManager.createAsset, { folderPath: "", basename: "root-a.txt" });
    await t.mutation(api.assetManager.createAsset, { folderPath: "", basename: "root-b.txt" });

    // kanban/backlog assets
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });
    await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "kanban",
      name: "backlog",
    });

    await t.mutation(api.assetManager.createAsset, {
      folderPath: "kanban/backlog",
      basename: "card-1.json",
    });

    await t.mutation(api.assetManager.createAsset, {
      folderPath: "kanban/backlog",
      basename: "card-2.json",
    });

    // asset in another folder
    await t.mutation(api.assetManager.createAsset, {
      folderPath: "kanban",
      basename: "board-settings.json",
    });

    const rootAssets = await t.query(api.assetManager.listAssets, { folderPath: "" });
    const backlogAssets = await t.query(api.assetManager.listAssets, {
      folderPath: "kanban/backlog",
    });
    const kanbanAssets = await t.query(api.assetManager.listAssets, { folderPath: "kanban" });

    const rootNames = rootAssets.map((a) => a.basename).sort();
    const backlogNames = backlogAssets.map((a) => a.basename).sort();
    const kanbanNames = kanbanAssets.map((a) => a.basename).sort();

    expect(rootNames).toEqual(["root-a.txt", "root-b.txt"]);
    expect(backlogNames).toEqual(["card-1.json", "card-2.json"]);
    expect(kanbanNames).toEqual(["board-settings.json"]);

    // Spot-check createdBy/updatedBy exist on listed assets and are consistent.
    for (const asset of [...rootAssets, ...backlogAssets, ...kanbanAssets]) {
      expect(asset.createdAt).toBeGreaterThan(0);
      expect(asset.updatedAt).toBeGreaterThan(0);
      expect(asset.createdBy ?? null).toBe(asset.updatedBy ?? null);
    }
  });

  it("listAssets includes publishedVersionId when asset has a published version", async () => {
    const t = convexTest(schema, modules);

    // Create asset and commit a published version using commitVersion
    await t.mutation(api.assetManager.createAsset, {
      folderPath: "",
      basename: "test-with-version.txt",
    });

    // Commit a version to set publishedVersionId
    const result = await t.mutation(api.assetManager.commitVersion, {
      folderPath: "",
      basename: "test-with-version.txt",
      label: "v1",
    });

    // List assets and verify publishedVersionId is included
    const assets = await t.query(api.assetManager.listAssets, { folderPath: "" });

    expect(assets).toHaveLength(1);
    const asset = assets[0];
    expect(asset.basename).toBe("test-with-version.txt");

    // publishedVersionId should be present after a version is published
    expect(asset.publishedVersionId).toBeDefined();
    expect(asset.publishedVersionId).toBe(result.versionId);
  });
});

describe("getFolderWithAssets", () => {
  it("returns null for non-existent folder", async () => {
    const t = convexTest(schema, modules);

    const result = await t.query(api.assetManager.getFolderWithAssets, { path: "non-existent" });

    expect(result).toBeNull();
  });

  it("returns null for empty path when no root folder exists", async () => {
    const t = convexTest(schema, modules);

    const result = await t.query(api.assetManager.getFolderWithAssets, { path: "" });

    expect(result).toBeNull();
  });

  it("returns folder with empty assets array when folder exists but has no assets", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "empty-folder" });

    const result = await t.query(api.assetManager.getFolderWithAssets, { path: "empty-folder" });

    expect(result).not.toBeNull();
    expect(result!.folder.path).toBe("empty-folder");
    expect(result!.folder.name).toBe("empty-folder");
    expect(result!.assets).toEqual([]);
  });

  it("returns folder with assets when both exist", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, {
      path: "project/docs",
      name: "Documentation",
    });

    await t.mutation(api.assetManager.createAsset, {
      folderPath: "project/docs",
      basename: "readme.md",
    });

    await t.mutation(api.assetManager.createAsset, {
      folderPath: "project/docs",
      basename: "api.md",
    });

    const result = await t.query(api.assetManager.getFolderWithAssets, { path: "project/docs" });

    expect(result).not.toBeNull();
    expect(result!.folder.path).toBe("project/docs");
    expect(result!.folder.name).toBe("Documentation");
    expect(result!.assets).toHaveLength(2);

    const assetNames = result!.assets.map((a) => a.basename).sort();
    expect(assetNames).toEqual(["api.md", "readme.md"]);

    // Check asset properties
    const readmeAsset = result!.assets.find((a) => a.basename === "readme.md");
    expect(readmeAsset).toBeDefined();
    expect(readmeAsset!.folderPath).toBe("project/docs");
    expect(readmeAsset!.versionCounter).toBe(0);
  });

  it("normalizes folder path correctly", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "test/folder" });

    await t.mutation(api.assetManager.createAsset, {
      folderPath: "test/folder",
      basename: "file.txt",
    });

    // Test with trailing slash
    const result1 = await t.query(api.assetManager.getFolderWithAssets, { path: "test/folder/" });

    // Test with leading slash
    const result2 = await t.query(api.assetManager.getFolderWithAssets, { path: "/test/folder" });

    // Test with both
    const result3 = await t.query(api.assetManager.getFolderWithAssets, { path: "/test/folder/" });

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result3).not.toBeNull();

    expect(result1!.folder.path).toBe("test/folder");
    expect(result2!.folder.path).toBe("test/folder");
    expect(result3!.folder.path).toBe("test/folder");

    expect(result1!.assets).toHaveLength(1);
    expect(result2!.assets).toHaveLength(1);
    expect(result3!.assets).toHaveLength(1);
  });

  it("includes all required fields in folder and assets", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ tokenIdentifier: "user-1" });

    await asUser.mutation(api.assetManager.createFolderByPath, { path: "test-folder" });

    await asUser.mutation(api.assetManager.createAsset, {
      folderPath: "test-folder",
      basename: "test-asset.txt",
    });

    const result = await asUser.query(api.assetManager.getFolderWithAssets, {
      path: "test-folder",
    });

    expect(result).not.toBeNull();

    // Check folder fields
    const folder = result!.folder;
    expect(folder._id).toBeDefined();
    expect(folder.path).toBe("test-folder");
    expect(folder.name).toBe("test-folder");
    expect(folder.createdAt).toBeGreaterThan(0);
    expect(folder.updatedAt).toBeGreaterThan(0);
    expect(folder.createdBy).toBe("user-1");
    expect(folder.updatedBy).toBe("user-1");
    expect(folder._creationTime).toBeGreaterThan(0);

    // Check asset fields
    const asset = result!.assets[0];
    expect(asset._id).toBeDefined();
    expect(asset.folderPath).toBe("test-folder");
    expect(asset.basename).toBe("test-asset.txt");
    expect(asset.versionCounter).toBe(0);
    expect(asset.createdAt).toBeGreaterThan(0);
    expect(asset.updatedAt).toBeGreaterThan(0);
    expect(asset.createdBy).toBe("user-1");
    expect(asset.updatedBy).toBe("user-1");
    expect(asset._creationTime).toBeGreaterThan(0);
  });
});

describe("renameAsset", () => {
  it("renames an asset's basename within the same folder", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createAsset, { folderPath: "", basename: "old-name.txt" });

    await t.mutation(api.assetManager.renameAsset, {
      folderPath: "",
      basename: "old-name.txt",
      newBasename: "new-name.txt",
    });

    // Old name should not exist
    const oldAsset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "old-name.txt",
    });
    expect(oldAsset).toBeNull();

    // New name should exist
    const newAsset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "new-name.txt",
    });
    expect(newAsset).not.toBeNull();
    expect(newAsset?.basename).toBe("new-name.txt");
  });

  it("preserves asset versions and published state after rename", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createAsset, { folderPath: "", basename: "versioned.txt" });

    // Commit a published version
    const result = await t.mutation(api.assetManager.commitVersion, {
      folderPath: "",
      basename: "versioned.txt",
      label: "v1",
    });

    await t.mutation(api.assetManager.renameAsset, {
      folderPath: "",
      basename: "versioned.txt",
      newBasename: "renamed-versioned.txt",
    });

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "renamed-versioned.txt",
    });

    expect(asset).not.toBeNull();
    expect(asset?.publishedVersionId).toBe(result.versionId);
    expect(asset?.versionCounter).toBe(1);
  });

  it("throws when asset does not exist", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.assetManager.renameAsset, {
        folderPath: "",
        basename: "non-existent.txt",
        newBasename: "new-name.txt",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("throws when new basename already exists in the same folder", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createAsset, { folderPath: "", basename: "file-a.txt" });

    await t.mutation(api.assetManager.createAsset, { folderPath: "", basename: "file-b.txt" });

    await expect(
      t.mutation(api.assetManager.renameAsset, {
        folderPath: "",
        basename: "file-a.txt",
        newBasename: "file-b.txt",
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("throws when new basename contains a slash", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createAsset, { folderPath: "", basename: "file.txt" });

    await expect(
      t.mutation(api.assetManager.renameAsset, {
        folderPath: "",
        basename: "file.txt",
        newBasename: "folder/file.txt",
      }),
    ).rejects.toThrow(/cannot contain/i);
  });

  it("updates updatedAt and updatedBy on rename", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ tokenIdentifier: "user-1" });

    const assetId = await asUser.mutation(api.assetManager.createAsset, {
      folderPath: "",
      basename: "original.txt",
    });

    const beforeAsset = await asUser.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "original.txt",
    });

    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    const asUser2 = t.withIdentity({ tokenIdentifier: "user-2" });
    await asUser2.mutation(api.assetManager.renameAsset, {
      folderPath: "",
      basename: "original.txt",
      newBasename: "renamed.txt",
    });

    const afterAsset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "renamed.txt",
    });

    expect(afterAsset?._id).toBe(assetId);
    expect(afterAsset?.updatedAt).toBeGreaterThan(beforeAsset!.updatedAt);
    expect(afterAsset?.updatedBy).toBe("user-2");
    expect(afterAsset?.createdBy).toBe("user-1"); // createdBy unchanged
  });

  it("logs a rename event", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createAsset, { folderPath: "docs", basename: "readme.md" });

    await t.mutation(api.assetManager.renameAsset, {
      folderPath: "docs",
      basename: "readme.md",
      newBasename: "README.md",
    });

    const events = await t.query(api.assetManager.listAssetEvents, {
      folderPath: "docs",
      basename: "README.md",
    });

    const renameEvent = events.find((e) => e.type === "rename");
    expect(renameEvent).toBeDefined();
    expect(renameEvent?.fromBasename).toBe("readme.md");
    expect(renameEvent?.toBasename).toBe("README.md");
  });

  it("allows renaming in nested folders", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "deep/nested/folder" });

    await t.mutation(api.assetManager.createAsset, {
      folderPath: "deep/nested/folder",
      basename: "old.txt",
    });

    await t.mutation(api.assetManager.renameAsset, {
      folderPath: "deep/nested/folder",
      basename: "old.txt",
      newBasename: "new.txt",
    });

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "deep/nested/folder",
      basename: "new.txt",
    });

    expect(asset).not.toBeNull();
    expect(asset?.folderPath).toBe("deep/nested/folder");
    expect(asset?.basename).toBe("new.txt");
  });
});

describe("getR2KeysByPathPrefix", () => {
  it("returns empty array when no assets exist", async () => {
    const t = convexTest(schema, modules);

    const keys = await t.query(api.assetManager.getR2KeysByPathPrefix, {
      pathPrefix: "nonexistent/path",
    });

    expect(keys).toEqual([]);
  });

  it("returns r2Keys for assets in the path prefix", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "books/test-book" });

    await t.run(async (ctx) => {
      const assetId = await ctx.db.insert("assets", {
        folderPath: "books/test-book",
        basename: "chapter1.xml",
        versionCounter: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await ctx.db.insert("assetVersions", {
        assetId,
        version: 1,
        state: "published",
        r2Key: "bookgenius/abc123/chapter1.xml",
        createdAt: Date.now(),
      });
    });

    const keys = await t.query(api.assetManager.getR2KeysByPathPrefix, {
      pathPrefix: "books/test-book",
    });

    expect(keys).toEqual(["bookgenius/abc123/chapter1.xml"]);
  });

  it("returns keys from nested folders", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "books/test-book" });
    await t.mutation(api.assetManager.createFolderByPath, { path: "books/test-book/characters" });

    await t.run(async (ctx) => {
      const assetId = await ctx.db.insert("assets", {
        folderPath: "books/test-book/characters",
        basename: "avatar.png",
        versionCounter: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await ctx.db.insert("assetVersions", {
        assetId,
        version: 1,
        state: "published",
        r2Key: "bookgenius/def456/avatar.png",
        createdAt: Date.now(),
      });
    });

    const keys = await t.query(api.assetManager.getR2KeysByPathPrefix, {
      pathPrefix: "books/test-book",
    });

    expect(keys).toEqual(["bookgenius/def456/avatar.png"]);
  });
});

describe("deleteByPathPrefixBatch", () => {
  it("deletes main folder and all child folders", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "books/test-book" });
    await t.mutation(api.assetManager.createFolderByPath, { path: "books/test-book/chapters" });
    await t.mutation(api.assetManager.createFolderByPath, { path: "books/test-book/characters" });

    const result = await t.mutation(api.assetManager.deleteByPathPrefixBatch, {
      pathPrefix: "books/test-book",
    });

    expect(result.deletedFolders).toBe(3);
    expect(result.hasMore).toBe(false);

    const mainFolder = await t.query(api.assetManager.getFolder, { path: "books/test-book" });
    expect(mainFolder).toBeNull();

    const chaptersFolder = await t.query(api.assetManager.getFolder, {
      path: "books/test-book/chapters",
    });
    expect(chaptersFolder).toBeNull();
  });

  it("deletes assets and their versions", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "books/test-book" });
    await t.mutation(api.assetManager.createAsset, {
      folderPath: "books/test-book",
      basename: "cover.jpg",
    });
    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "books/test-book",
      basename: "cover.jpg",
    });

    const result = await t.mutation(api.assetManager.deleteByPathPrefixBatch, {
      pathPrefix: "books/test-book",
    });

    expect(result.deletedAssets).toBe(1);
    expect(result.deletedVersions).toBe(1);
    expect(result.deletedFolders).toBe(1);

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "books/test-book",
      basename: "cover.jpg",
    });
    expect(asset).toBeNull();
  });

  it("does not delete folders outside the prefix", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "books/book-a" });
    await t.mutation(api.assetManager.createFolderByPath, { path: "books/book-b" });
    await t.mutation(api.assetManager.createFolderByPath, { path: "other-folder" });

    await t.mutation(api.assetManager.deleteByPathPrefixBatch, { pathPrefix: "books/book-a" });

    const bookA = await t.query(api.assetManager.getFolder, { path: "books/book-a" });
    expect(bookA).toBeNull();

    const bookB = await t.query(api.assetManager.getFolder, { path: "books/book-b" });
    expect(bookB).not.toBeNull();

    const otherFolder = await t.query(api.assetManager.getFolder, { path: "other-folder" });
    expect(otherFolder).not.toBeNull();
  });

  it("returns hasMore=true when batch limit is reached", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "books/big-book" });
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.assetManager.createAsset, {
        folderPath: "books/big-book",
        basename: `file-${i}.txt`,
      });
    }

    const result = await t.mutation(api.assetManager.deleteByPathPrefixBatch, {
      pathPrefix: "books/big-book",
      batchSize: 3,
    });

    expect(result.deletedAssets).toBe(3);
    expect(result.hasMore).toBe(true);

    const result2 = await t.mutation(api.assetManager.deleteByPathPrefixBatch, {
      pathPrefix: "books/big-book",
      batchSize: 3,
    });

    expect(result2.deletedAssets).toBe(2);
    expect(result2.deletedFolders).toBe(1);
    expect(result2.hasMore).toBe(false);
  });

  it("returns empty result when prefix does not exist", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(api.assetManager.deleteByPathPrefixBatch, {
      pathPrefix: "nonexistent/path",
    });

    expect(result.deletedFolders).toBe(0);
    expect(result.deletedAssets).toBe(0);
    expect(result.deletedVersions).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it("does not delete main folder twice (no duplicate error)", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "books/solo-book" });
    await t.mutation(api.assetManager.createAsset, {
      folderPath: "books/solo-book",
      basename: "readme.txt",
    });

    const result = await t.mutation(api.assetManager.deleteByPathPrefixBatch, {
      pathPrefix: "books/solo-book",
    });

    expect(result.deletedFolders).toBe(1);
    expect(result.deletedAssets).toBe(1);
    expect(result.hasMore).toBe(false);
  });
});
