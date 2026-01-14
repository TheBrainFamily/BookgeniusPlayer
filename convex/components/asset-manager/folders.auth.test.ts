// convex/folders.auth.test.ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

describe("folders: createdBy / updatedBy attribution", () => {
  it("createFolderByPath without identity leaves createdBy/updatedBy undefined", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.assetManager.createFolderByPath, { path: "kanban/backlog" });

    const folder = await t.query(api.assetManager.getFolder, { path: "kanban/backlog" });

    expect(folder?.createdBy).toBeUndefined();
    expect(folder?.updatedBy).toBeUndefined();
  });

  it("createFolderByPath sets createdBy/updatedBy from auth identity", async () => {
    const t = convexTest(schema, modules);

    const asUser = t.withIdentity({ tokenIdentifier: "user-1" });

    const id = await asUser.mutation(api.assetManager.createFolderByPath, {
      path: "kanban/backlog",
    });

    const folder = await asUser.query(api.assetManager.getFolder, { path: "kanban/backlog" });

    expect(folder?._id).toEqual(id);
    expect(folder?.createdBy).toBe("user-1");
    expect(folder?.updatedBy).toBe("user-1");
  });

  it("createFolderByName sets createdBy/updatedBy from auth identity", async () => {
    const t = convexTest(schema, modules);

    const asUser = t.withIdentity({ tokenIdentifier: "user-1" });

    const id = await asUser.mutation(api.assetManager.createFolderByName, {
      parentPath: "",
      name: "Kanban",
    });

    // path is slugified to lowercase
    const folder = await asUser.query(api.assetManager.getFolder, { path: "kanban" });

    expect(folder?._id).toEqual(id);
    expect(folder?.createdBy).toBe("user-1");
    expect(folder?.updatedBy).toBe("user-1");
  });

  it("updateFolder changes updatedBy but preserves createdBy when actor changes", async () => {
    const t = convexTest(schema, modules);

    const asUser1 = t.withIdentity({ tokenIdentifier: "user-1" });

    await asUser1.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });

    // path is slugified to lowercase
    const afterCreate = await asUser1.query(api.assetManager.getFolder, { path: "kanban" });

    expect(afterCreate?.createdBy).toBe("user-1");
    expect(afterCreate?.updatedBy).toBe("user-1");

    const asUser2 = t.withIdentity({ tokenIdentifier: "user-2" });

    await asUser2.mutation(api.assetManager.updateFolder, { path: "kanban", name: "Kanban board" });

    const afterUpdate = await asUser2.query(api.assetManager.getFolder, { path: "kanban" });

    expect(afterUpdate?.createdBy).toBe("user-1");
    expect(afterUpdate?.updatedBy).toBe("user-2");
  });

  it("anonymous update clears existing updatedBy", async () => {
    const t = convexTest(schema, modules);

    const asUser1 = t.withIdentity({ tokenIdentifier: "user-1" });

    await asUser1.mutation(api.assetManager.createFolderByPath, { path: "kanban" });

    // Anonymous update (no identity)
    await t.mutation(api.assetManager.updateFolder, { path: "kanban", name: "Kanban new" });

    const folder = await t.query(api.assetManager.getFolder, { path: "kanban" });

    expect(folder?.createdBy).toBe("user-1");
    expect(folder?.updatedBy).toBeUndefined();
  });

  it("created anonymously, then updated by a user, sets updatedBy but not createdBy", async () => {
    const t = convexTest(schema, modules);

    // Anonymous create
    await t.mutation(api.assetManager.createFolderByPath, { path: "anonymous/folder" });

    const asUser = t.withIdentity({ tokenIdentifier: "user-1" });

    await asUser.mutation(api.assetManager.updateFolder, {
      path: "anonymous/folder",
      name: "Owned now",
    });

    const folder = await asUser.query(api.assetManager.getFolder, { path: "anonymous/folder" });

    expect(folder?.createdBy).toBeUndefined();
    expect(folder?.updatedBy).toBe("user-1");
  });

  it("listFolders includes createdBy/updatedBy in results", async () => {
    const t = convexTest(schema, modules);

    const asUser = t.withIdentity({ tokenIdentifier: "user-1" });

    await asUser.mutation(api.assetManager.createFolderByName, { parentPath: "", name: "Kanban" });

    const folders = await asUser.query(api.assetManager.listFolders, {});

    expect(folders).toHaveLength(1);
    // path is slugified to lowercase
    expect(folders[0].path).toBe("kanban");
    expect(folders[0].createdBy).toBe("user-1");
    expect(folders[0].updatedBy).toBe("user-1");
  });
});
