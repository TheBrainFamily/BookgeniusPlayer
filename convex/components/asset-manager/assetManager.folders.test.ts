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
      path: "other-stuff",
    });

    expect(folder?._id).toEqual(id);
    expect(folder?.path).toBe("other-stuff");
    // human-facing label is exactly what was passed
    expect(folder?.name).toBe("Other Stuff");
  });

  it("createFolderByName under a parent slugifies segment and preserves label", async () => {
    const t = convexTest(schema, modules);

    // create parent via name API - path will be slugified to lowercase
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });

    const qAndAId = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "kanban", // lowercase - matches slugified parent path
      name: "Q&A",
    });

    const folder = await t.query(api.assetManager.getFolder, {
      // structural path uses slugified segment (lowercase)
      path: "kanban/qa",
    });

    expect(folder?._id).toEqual(qAndAId);
    expect(folder?.path).toBe("kanban/qa");
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

    // parent - path will be slugified to "kanban"
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });

    const id1 = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "kanban",
      name: "Q&A", // base slug: "qa" (lowercase, & stripped)
    });

    const id2 = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "kanban",
      name: "Q/A", // same base slug "qa", different label
    });

    expect(id2).not.toEqual(id1);

    const children = await t.query(api.assetManager.listFolders, { parentPath: "kanban" });

    const byPath: Record<string, { name: string }> = {};
    for (const f of children) {
      byPath[f.path] = { name: f.name };
    }

    const paths = Object.keys(byPath).sort();

    // First folder gets the plain slug (lowercase)
    expect(paths).toContain("kanban/qa");
    expect(byPath["kanban/qa"]?.name).toBe("Q&A");

    // Second folder should get a suffixed slug like "qa-2"
    const suffixed = paths.find((p) => p !== "kanban/qa" && p.startsWith("kanban/qa-"));
    expect(suffixed).toBeDefined();
    if (suffixed) {
      expect(byPath[suffixed].name).toBe("Q/A");
    }
  });

  it("listFolders returns direct children of root and direct children of a nested parent (prefix + depth)", async () => {
    const t = convexTest(schema, modules);

    // root children via name API - paths slugified to lowercase
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Other Stuff" });

    // children of kanban (use lowercase path)
    await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "kanban",
      name: "backlog",
    });
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "kanban", name: "doing" });
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "kanban", name: "review" });

    // deeper nested child (should NOT appear as direct child of "kanban")
    await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "kanban/backlog",
      name: "inner",
    });

    const rootChildren = await t.query(api.assetManager.listFolders, {
      // no parentPath => children of root (depth = 1)
    });

    const rootPaths = rootChildren.map((f) => f.path).sort();

    // Paths are slugified to lowercase
    expect(rootPaths).toEqual(["kanban", "other-stuff"]);
    const kanbanChildren = await t.query(api.assetManager.listFolders, {
      parentPath: "kanban", // direct children of "kanban" (depth = 2)
    });
    const kanbanPaths = kanbanChildren.map((f) => f.path).sort();

    // root: only first-level folders

    // kanban: only second-level folders under "kanban"
    expect(kanbanPaths).toEqual(["kanban/backlog", "kanban/doing", "kanban/review"]);

    // and *not* the deeper child
    expect(kanbanPaths).not.toContain("kanban/backlog/inner");
  });
});

describe("createFolderByName slug + collision behaviour", () => {
  it("handles slug collisions under same parent by suffixing", async () => {
    const t = convexTest(schema, modules);

    // parent - path will be slugified to "kanban"
    await t.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });

    const id1 = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "kanban",
      name: "Q&A", // base slug: "qa" (lowercase, & stripped)
    });

    const id2 = await t.mutation(api.assetManager.createFolderByName, {
      parentPath: "kanban",
      name: "Q/A", // same base slug "qa", different label
    });

    expect(id2).not.toEqual(id1);

    const children = await t.query(api.assetManager.listFolders, { parentPath: "kanban" });

    const byPath: Record<string, { name: string }> = {};
    for (const f of children) {
      byPath[f.path] = { name: f.name };
    }

    const paths = Object.keys(byPath).sort();

    // First folder gets the plain slug (lowercase)
    expect(paths).toContain("kanban/qa");
    expect(byPath["kanban/qa"]?.name).toBe("Q&A");

    // Second folder should get a suffixed slug like "qa-2"
    const suffixed = paths.find((p) => p !== "kanban/qa" && p.startsWith("kanban/qa-"));
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

  const folder = await t.query(api.assetManager.getFolder, { path: "other/place" });

  expect(folder?.path).toBe("other/place");
  // name is derived from the last segment of the original path, which is "place"
  expect(folder?.name).toBe("place");
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

    // Both children should be root-level, no leading slashes (lowercase slugified)
    expect(paths).toContain("qa");
    const suffixedRoot = paths.find((p) => p !== "qa" && p.startsWith("qa-"));
    expect(suffixedRoot).toBeDefined();

    expect(byPath["qa"]?.name).toBe("Q&A");
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
    });
    await t.mutation(api.assetManager.createFolderByPath, { path: "characters/bob", name: "Bob" });

    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "characters/alice",
      basename: "avatar.png",
    });
    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "characters/alice",
      basename: "speaks.mp4",
    });
    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "characters/bob",
      basename: "avatar.png",
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

  it("returns folders with assets in nested paths", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, {
      path: "books/mybook/characters/hero",
      name: "Hero Character",
    });

    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "books/mybook/characters/hero",
      basename: "avatar.png",
    });

    const result = await t.query(api.assetManager.listFoldersWithAssets, {
      parentPath: "books/mybook/characters",
    });

    expect(result).toHaveLength(1);
    expect(result[0].folder.name).toBe("Hero Character");
  });
});
