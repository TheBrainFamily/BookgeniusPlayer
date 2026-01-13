// @vitest-environment node
// convex/assetManager.files.test.ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./test.setup";

describe("file-backed asset versions (createVersionFromStorageId + published URLs)", () => {
  it("createVersionFromStorageId creates first published file-backed version for a new asset", async () => {
    const t = convexTest(schema, modules);

    // Insert fake file metadata into _storage for testing
    const storageId = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
      size: 1234,
      contentType: "audio/mpeg",
    });

    const { assetId, versionId, version } = await t.mutation(
      api.assetManager.createVersionFromStorageId,
      { folderPath: "odyssey/ch1", basename: "01-intro.mp3", storageId, label: "Intro" },
    );

    expect(version).toBe(1);

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "odyssey/ch1",
      basename: "01-intro.mp3",
    });

    expect(asset?._id).toEqual(assetId);
    expect(asset?.versionCounter).toBe(1);
    expect(asset?.publishedVersionId).toEqual(versionId);

    const versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "odyssey/ch1",
      basename: "01-intro.mp3",
    });

    expect(versions).toHaveLength(1);
    const v1 = versions[0];
    expect(v1._id).toEqual(versionId);
    expect(v1.version).toBe(1);
    expect(v1.state).toBe("published");
    expect(v1.label).toBe("Intro");

    // from _storage
    expect(v1.storageId).toEqual(storageId);
    expect(v1.size).toBe(1234);
    // expect(v1.contentType).toBe("audio/mpeg");
    expect(typeof v1.sha256).toBe("string");
    expect((v1.sha256 ?? "").length).toBeGreaterThan(0);

    // actor fields should be consistent
    expect(v1.createdBy ?? null).toBe(v1.publishedBy ?? null);

    // And we can get a usable URL for the published file
    const publishedFile = await t.query(api.assetManager.getPublishedFile, {
      folderPath: "odyssey/ch1",
      basename: "01-intro.mp3",
    });

    expect(publishedFile).not.toBeNull();
    expect(publishedFile?.version).toBe(1);
    expect(publishedFile?.folderPath).toBe("odyssey/ch1");
    expect(publishedFile?.basename).toBe("01-intro.mp3");
    expect(publishedFile?.size).toBe(1234);
    // expect(publishedFile?.contentType).toBe("audio/mpeg");
    expect(publishedFile?.storageId).toEqual(storageId);
    expect(typeof publishedFile?.url).toBe("string");
    expect((publishedFile?.url ?? "").length).toBeGreaterThan(0);
  });

  it("second published upload archives the previous published version", async () => {
    const t = convexTest(schema, modules);

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
      basename: "cover.png",
      storageId: s1,
      label: "v1",
    });

    const v2 = await t.mutation(api.assetManager.createVersionFromStorageId, {
      folderPath: "",
      basename: "cover.png",
      storageId: s2,
      label: "v2",
    });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "cover.png",
    });

    expect(asset?.versionCounter).toBe(2);
    expect(asset?.publishedVersionId).toEqual(v2.versionId);

    const versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "",
      basename: "cover.png",
    });

    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
    const byVersion = Object.fromEntries(versions.map((vv) => [vv.version, vv]));

    const vv1 = byVersion[1];
    const vv2 = byVersion[2];

    expect(vv1.state).toBe("archived");
    expect(vv1.archivedAt).toBeGreaterThan(0);
    expect(vv1.archivedBy ?? null).toBe(vv2.publishedBy ?? null);
    expect(vv1.storageId).toEqual(s1);
    expect(vv2.storageId).toEqual(s2);

    const publishedFile = await t.query(api.assetManager.getPublishedFile, {
      folderPath: "",
      basename: "cover.png",
    });

    expect(publishedFile).not.toBeNull();
    expect(publishedFile?.version).toBe(2);
    expect(publishedFile?.size).toBe(200);
    expect(typeof publishedFile?.sha256).toBe("string");
    expect((publishedFile?.sha256 ?? "").length).toBeGreaterThan(0);
    expect(publishedFile?.storageId).toEqual(s2);
  });

  it("listPublishedFilesInFolder returns only published assets for that folder", async () => {
    const t = convexTest(schema, modules);

    const s1 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, { size: 1 });
    const s2 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, { size: 2 });
    const s3 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, { size: 3 });

    // root published
    await t.mutation(api.assetManager.createVersionFromStorageId, {
      folderPath: "",
      basename: "root-a.txt",
      storageId: s1,
    });

    // backlog files
    await t.mutation(api.assetManager.createVersionFromStorageId, {
      folderPath: "kanban/backlog",
      basename: "card-1.json",
      storageId: s2,
    });
    await t.mutation(api.assetManager.createVersionFromStorageId, {
      folderPath: "kanban/backlog",
      basename: "card-2.json",
      storageId: s3,
    });

    const rootFiles = await t.query(api.assetManager.listPublishedFilesInFolder, {
      folderPath: "",
    });
    const backlogFiles = await t.query(api.assetManager.listPublishedFilesInFolder, {
      folderPath: "kanban/backlog",
    });

    const rootNames = rootFiles.map((f) => f.basename).sort();
    const backlogNames = backlogFiles.map((f) => f.basename).sort();

    expect(rootNames).toEqual(["root-a.txt"]);
    expect(backlogNames).toEqual(["card-1.json", "card-2.json"]);

    for (const f of [...rootFiles, ...backlogFiles]) {
      expect(typeof f.url).toBe("string");
      expect(f.url.length).toBeGreaterThan(0);
      expect(f.version).toBeGreaterThan(0);
    }
  });
});
