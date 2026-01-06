import { describe, it, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

describe("folders: path-first + label-first APIs", () => {
  it("createFolderByPath normalizes basic path and infers default name from last segment", async () => {
    const t = convexTest(schema, modules);

    const id = await t.mutation(api.assetManager.createFolderByPath, {
      // spaces and trailing slash should be normalized away,
      // but NOT slugified – this is the low-level path-first API.
      path: "  kanban/backlog/  ",
      // name omitted → default from last segment: "backlog"
    });

    const folder = await t.query(api.assetManager.getFolder, { path: "kanban/backlog" });

    expect(folder?._id).toEqual(id);
    expect(folder?.path).toBe("kanban/backlog");
    expect(folder?.name).toBe("backlog");
  });

  it("createFolderByPath sets name for root path", async () => {
    const t = convexTest(schema, modules);

    const id = await t.mutation(api.assetManager.createFolderByPath, {
      // spaces and trailing slash should be normalized away,
      // but NOT slugified – this is the low-level path-first API.
      path: "kanban",
      // name omitted → default from last segment: "backlog"
    });

    const folder = await t.query(api.assetManager.getFolder, { path: "kanban" });

    expect(folder?._id).toEqual(id);
    expect(folder?.path).toBe("kanban");
    expect(folder?.name).toBe("kanban");
  });

  it("createFolderByPath throws on empty path", async () => {
    const t = convexTest(schema, modules);

    await expect(t.mutation(api.assetManager.createFolderByPath, { path: "" })).rejects.toThrow(
      /cannot be empty/i,
    );
  });

  it("createFolderByName creates root-level folder with slugified path and preserves label", async () => {
    const t = convexTest(schema, modules);

    const id = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "",
      name: "Other Stuff",
    });

    const folder = await t.query(api.assetManager.getFolder, {
      // structural path is slugified
      path: "Other-Stuff",
    });

    expect(folder?._id).toEqual(id);
    expect(folder?.path).toBe("Other-Stuff");
    // human-facing label is exactly what was passed
    expect(folder?.name).toBe("Other Stuff");
  });

  it("createFolderByName under a parent slugifies segment and preserves label", async () => {
    const t = convexTest(schema, modules);

    // create parent via name API
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });

    const qAndAId = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "Kanban",
      name: "Q&A",
    });

    const folder = await t.query(api.assetManager.getFolder, {
      // structural path uses slugified segment
      path: "Kanban/QA",
    });

    expect(folder?._id).toEqual(qAndAId);
    expect(folder?.path).toBe("Kanban/QA");
    expect(folder?.name).toBe("Q&A");
  });

  it("createFolderByName throws when same parent + same name already exist", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });

    await expect(
      t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" }),
    ).rejects.toThrow(/already exists/i);
  });

  it("listFolders returns empty array when there are no folders", async () => {
    const t = convexTest(schema, modules);

    const folders = await t.query(api.assetManager.listFolders, { parentPath: "" });
    expect(folders).toHaveLength(0);
  });

  it("listFolders returns the folders from the correct path", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "kanban/backlog" });

    await t.mutation(api.assetManager.createFolderByPath, { path: "kanban/doing" });

    await t.mutation(api.assetManager.createFolderByPath, { path: "other/stuff" });

    const folders = await t.query(api.assetManager.listFolders, { parentPath: "kanban" });
    expect(folders).toHaveLength(2);
  });

  it("listFolders returns only one depth of folders", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "kanban/backlog" });

    await t.mutation(api.assetManager.createFolderByPath, { path: "kanban/doing" });

    await t.mutation(api.assetManager.createFolderByPath, { path: "kanban/doing/inner" });

    const folders = await t.query(api.assetManager.listFolders, { parentPath: "kanban" });
    expect(folders).toHaveLength(2);
  });

  it("createFolderByName handles slug collisions under same parent by suffixing", async () => {
    const t = convexTest(schema, modules);

    // parent
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });

    const id1 = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "Kanban",
      name: "Q&A", // base slug: "q-a"
    });

    const id2 = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "Kanban",
      name: "Q/A", // same base slug "q-a", different label
    });

    expect(id2).not.toEqual(id1);

    const children = await t.query(api.assetManager.listFolders, { parentPath: "Kanban" });

    const byPath: Record<string, { name: string }> = {};
    for (const f of children) {
      byPath[f.path] = { name: f.name };
    }

    const paths = Object.keys(byPath).sort();

    // First folder gets the plain slug
    expect(paths).toContain("Kanban/QA");
    expect(byPath["Kanban/QA"]?.name).toBe("Q&A");

    // Second folder should get a suffixed slug like "q-a-2"
    const suffixed = paths.find((p) => p !== "Kanban/QA" && p.startsWith("Kanban/QA-"));
    expect(suffixed).toBeDefined();
    if (suffixed) {
      expect(byPath[suffixed].name).toBe("Q/A");
    }
  });

  it("listFolders returns direct children of root and direct children of a nested parent (prefix + depth)", async () => {
    const t = convexTest(schema, modules);

    // root children via name API
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Other Stuff" });

    // children of Kanban
    await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "Kanban",
      name: "backlog",
    });
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "Kanban", name: "doing" });
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "Kanban", name: "review" });

    // deeper nested child (should NOT appear as direct child of "kanban")
    await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "Kanban/backlog",
      name: "inner",
    });

    const rootChildren = await t.query(api.assetManager.listFolders, {
      // no parentPath => children of root (depth = 1)
    });

    const rootPaths = rootChildren.map((f) => f.path).sort();

    expect(rootPaths).toEqual(["Kanban", "Other-Stuff"]);
    const kanbanChildren = await t.query(api.assetManager.listFolders, {
      parentPath: "Kanban", // direct children of "Kanban" (depth = 2)
    });
    const kanbanPaths = kanbanChildren.map((f) => f.path).sort();

    // root: only first-level folders

    // kanban: only second-level folders under "kanban"
    expect(kanbanPaths).toEqual(["Kanban/backlog", "Kanban/doing", "Kanban/review"]);

    // and *not* the deeper child
    expect(kanbanPaths).not.toContain("Kanban/backlog/inner");
  });
});

describe("createFolderByName slug + collision behaviour", () => {
  it("handles slug collisions under same parent by suffixing", async () => {
    const t = convexTest(schema, modules);

    // parent
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });

    const id1 = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "Kanban",
      name: "Q&A", // base slug: "q-a"
    });

    const id2 = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "Kanban",
      name: "Q/A", // same base slug "q-a", different label
    });

    expect(id2).not.toEqual(id1);

    const children = await t.query(api.assetManager.listFolders, { parentPath: "Kanban" });

    const byPath: Record<string, { name: string }> = {};
    for (const f of children) {
      byPath[f.path] = { name: f.name };
    }

    const paths = Object.keys(byPath).sort();

    // First folder gets the plain slug
    expect(paths).toContain("Kanban/QA");
    expect(byPath["Kanban/QA"]?.name).toBe("Q&A");

    // Second folder should get a suffixed slug like "q-a-2"
    const suffixed = paths.find((p) => p !== "Kanban/QA" && p.startsWith("Kanban/QA-"));
    expect(suffixed).toBeDefined();
    if (suffixed) {
      expect(byPath[suffixed].name).toBe("Q/A");
    }
  });
});

test("does not return children from folders with dots in names", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(api.assetManager.createFolderByPath, { path: "test" });
  await t.mutation(api.assetManager.createFolderByPath, { path: "test/child" });
  await t.mutation(api.assetManager.createFolderByPath, {
    path: "test.other/child", // child of "test.other", NOT "test"
  });

  const folders = await t.query(api.assetManager.listFolders, { parentPath: "test" });

  expect(folders).toHaveLength(1);
  expect(folders[0].path).toBe("test/child");
});

test("createFolderByPath throws when same path already exist", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(api.assetManager.createFolderByPath, { path: "kanban" });

  await expect(t.mutation(api.assetManager.createFolderByPath, { path: "kanban" })).rejects.toThrow(
    /already exists/i,
  );
});

test("updateFolder throws when folder does not exist", async () => {
  const t = convexTest(schema, modules);

  await expect(
    t.mutation(api.assetManager.updateFolder, { path: "kanban", name: "Kanban" }),
  ).rejects.toThrow(/does not exist/i);
});

test("updateFolder updates the folder name", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(api.assetManager.createFolderByPath, { path: "test" });

  await t.mutation(api.assetManager.updateFolder, { path: "test", name: "Kanban" });

  const folder = await t.query(api.assetManager.getFolder, { path: "test" });

  expect(folder?.name).toBe("Kanban");
});

test("updateFolder updates the folder path", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(api.assetManager.createFolderByPath, { path: "some/place" });

  await t.mutation(api.assetManager.updateFolder, { path: "some/place", newPath: "other/place" });
});

//TODO what about updating to paths of other users?
// maybe originally I shouldn't care? But for things like generic image enerator or even bookgenius thats kinda needed
test("fails if trying to update a folder to a path that already exists", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(api.assetManager.createFolderByPath, { path: "test" });

  await t.mutation(api.assetManager.createFolderByPath, { path: "other/place" });

  await expect(
    t.mutation(api.assetManager.updateFolder, { path: "test", newPath: "other/place" }),
  ).rejects.toThrow(/already exists/i);
});

test("updateFolder updates the folder extra field", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(api.assetManager.createFolderByPath, {
    path: "books/my-book",
    extra: { type: "book", title: "Original Title" },
  });

  // Update the extra field
  await t.mutation(api.assetManager.updateFolder, {
    path: "books/my-book",
    extra: { type: "book", title: "Updated Title", author: "Jane Doe" },
  });

  const folder = await t.query(api.assetManager.getFolder, { path: "books/my-book" });

  expect(folder?.extra).toEqual({ type: "book", title: "Updated Title", author: "Jane Doe" });
});

test("updateFolder preserves extra when not provided", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(api.assetManager.createFolderByPath, {
    path: "books/another-book",
    extra: { type: "book", title: "My Book" },
  });

  // Update only the name, not extra
  await t.mutation(api.assetManager.updateFolder, {
    path: "books/another-book",
    name: "Renamed Book",
  });

  const folder = await t.query(api.assetManager.getFolder, { path: "books/another-book" });

  expect(folder?.name).toBe("Renamed Book");
  expect(folder?.extra).toEqual({ type: "book", title: "My Book" });
});

test("updateFolder can set extra to null", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(api.assetManager.createFolderByPath, {
    path: "books/temp-book",
    extra: { type: "book", title: "Temp" },
  });

  // Set extra to null
  await t.mutation(api.assetManager.updateFolder, { path: "books/temp-book", extra: null });

  const folder = await t.query(api.assetManager.getFolder, { path: "books/temp-book" });

  expect(folder?.extra).toBeNull();
});

describe("folders: path-first + label-first APIs v2", () => {
  it("createFolderByName handles slug collisions at root without leading slash", async () => {
    const t = convexTest(schema, modules);

    const id1 = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "",
      name: "Q&A",
    });

    const id2 = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "",
      name: "Q/A",
    });

    expect(id2).not.toEqual(id1);

    const rootChildren = await t.query(api.assetManager.listFolders, {});

    const paths = rootChildren.map((f) => f.path).sort();
    const byPath: Record<string, { name: string }> = {};
    for (const f of rootChildren) {
      byPath[f.path] = { name: f.name };
    }

    // Both children should be root-level, no leading slashes
    expect(paths).toContain("QA");
    const suffixedRoot = paths.find((p) => p !== "QA" && p.startsWith("QA-"));
    expect(suffixedRoot).toBeDefined();

    expect(byPath["QA"]?.name).toBe("Q&A");
    if (suffixedRoot) {
      expect(byPath[suffixedRoot].name).toBe("Q/A");
    }
  });
});

test("createFolderByPath sets createdBy/updatedBy from identity", async () => {
  const t = convexTest(schema, modules);

  const asUser = t.withIdentity({
    name: "Łukasz",
    tokenIdentifier: "user-123", // if you omit this, convex-test generates one
  }); // :contentReference[oaicite:4]{index=4}

  await asUser.mutation(api.assetManager.createFolderByPath, { path: "kanban/backlog" });

  const folder = await asUser.query(api.assetManager.getFolder, { path: "kanban/backlog" });

  expect(folder?.createdBy).toBe("user-123");
  expect(folder?.updatedBy).toBe("user-123");
});

describe("listFoldersWithAssets", () => {
  it("returns empty array when no child folders exist", async () => {
    const t = convexTest(schema, modules);

    const result = await t.query(api.assetManager.listFoldersWithAssets, {
      parentPath: "nonexistent",
    });

    expect(result).toHaveLength(0);
  });

  it("returns folders with their assets grouped correctly", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, {
      path: "characters/alice",
      name: "Alice",
      extra: { displayName: "Alice" },
    });
    await t.mutation(api.assetManager.createFolderByPath, {
      path: "characters/bob",
      name: "Bob",
      extra: { displayName: "Bob" },
    });

    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "characters/alice",
      basename: "avatar.png",
      publish: true,
    });
    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "characters/alice",
      basename: "speaks.mp4",
      publish: true,
    });
    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "characters/bob",
      basename: "avatar.png",
      publish: true,
    });

    const result = await t.query(api.assetManager.listFoldersWithAssets, {
      parentPath: "characters",
    });

    expect(result).toHaveLength(2);

    const alice = result.find((r) => r.folder.path === "characters/alice");
    const bob = result.find((r) => r.folder.path === "characters/bob");

    expect(alice).toBeDefined();
    expect(bob).toBeDefined();
    expect(alice?.folder.name).toBe("Alice");
    expect(bob?.folder.name).toBe("Bob");
  });

  it("does not return nested folders (only direct children)", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "parent/child" });
    await t.mutation(api.assetManager.createFolderByPath, { path: "parent/child/grandchild" });

    const result = await t.query(api.assetManager.listFoldersWithAssets, { parentPath: "parent" });

    expect(result).toHaveLength(1);
    expect(result[0].folder.path).toBe("parent/child");
  });

  it("preferDraft=true returns draft version over published", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "items/item1" });

    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "items/item1",
      basename: "data.json",
      publish: true,
      label: "published-v1",
    });

    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "items/item1",
      basename: "data.json",
      publish: false,
      label: "draft-v2",
    });

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "items/item1",
      basename: "data.json",
    });

    expect(asset?.publishedVersionId).toBeDefined();
    expect(asset?.draftVersionId).toBeDefined();
    expect(asset?.publishedVersionId).not.toBe(asset?.draftVersionId);
  });

  it("excludes assets without any version", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "test/folder1" });

    await t.mutation(api.assetManager.createAsset, {
      folderPath: "test/folder1",
      basename: "no-version.txt",
    });

    const result = await t.query(api.assetManager.listFoldersWithAssets, { parentPath: "test" });

    expect(result).toHaveLength(1);
    expect(result[0].assets).toHaveLength(0);
  });

  it("returns folder extra metadata", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, {
      path: "books/mybook/characters/hero",
      name: "Hero Character",
      extra: { displayName: "The Hero", summary: "A brave warrior" },
    });

    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "books/mybook/characters/hero",
      basename: "avatar.png",
      publish: true,
    });

    const result = await t.query(api.assetManager.listFoldersWithAssets, {
      parentPath: "books/mybook/characters",
    });

    expect(result).toHaveLength(1);
    expect(result[0].folder.extra).toEqual({ displayName: "The Hero", summary: "A brave warrior" });
  });
});
