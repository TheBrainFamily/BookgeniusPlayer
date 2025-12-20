import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./test.setup";

describe("asset versions (logical, no storage yet)", () => {
  it("commitVersion creates first published version for a new asset", async () => {
    const t = convexTest(schema, modules);

    const { assetId, versionId, version } = await t.mutation(
      api.assetManager.commitVersion,
      {
        folderPath: "",
        basename: "cover.jpg",
        publish: true,
        label: "Initial",
        extra: { note: "v1" },
      },
    );

    expect(version).toBe(1);

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "cover.jpg",
    });

    expect(asset?._id).toEqual(assetId);
    expect(asset?.versionCounter).toBe(1);
    expect(asset?.draftVersionId ?? null).toBeNull();
    expect(asset?.publishedVersionId).toEqual(versionId);
    expect(asset?.updatedAt).toBeGreaterThanOrEqual(asset!.createdAt);
    expect(asset?.createdBy ?? null).toBe(asset?.updatedBy ?? null);

    const versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "",
      basename: "cover.jpg",
    });

    expect(versions).toHaveLength(1);
    const v1 = versions[0];
    expect(v1._id).toEqual(versionId);
    expect(v1.version).toBe(1);
    expect(v1.state).toBe("published");
    expect(v1.label).toBe("Initial");
    expect(v1.extra).toEqual({ note: "v1" });
    expect(v1.createdAt).toBeGreaterThan(0);
    expect(v1.publishedAt).toBeGreaterThan(0);
    expect(v1.createdBy ?? null).toBe(v1.publishedBy ?? null);
  });

  it("commitVersion can create a draft first, then publishDraft promotes it", async () => {
    const t = convexTest(schema, modules);

    const draftRes = await t.mutation(api.assetManager.commitVersion, {
      folderPath: "kanban/backlog",
      basename: "card-1.json",
      publish: false,
      label: "Draft 1",
    });

    expect(draftRes.version).toBe(1);

    let asset = await t.query(api.assetManager.getAsset, {
      folderPath: "kanban/backlog",
      basename: "card-1.json",
    });

    expect(asset?.versionCounter).toBe(1);
    expect(asset?.draftVersionId).toEqual(draftRes.versionId);
    expect(asset?.publishedVersionId ?? null).toBeNull();

    let versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "kanban/backlog",
      basename: "card-1.json",
    });

    expect(versions).toHaveLength(1);
    expect(versions[0].state).toBe("draft");
    expect(versions[0].publishedAt ?? null).toBeNull();

    // Now publish the draft
    await t.mutation(api.assetManager.publishDraft, {
      folderPath: "kanban/backlog",
      basename: "card-1.json",
    });

    asset = await t.query(api.assetManager.getAsset, {
      folderPath: "kanban/backlog",
      basename: "card-1.json",
    });

    expect(asset?.versionCounter).toBe(1);
    expect(asset?.draftVersionId ?? null).toBeNull();
    expect(asset?.publishedVersionId).toEqual(draftRes.versionId);

    versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "kanban/backlog",
      basename: "card-1.json",
    });

    expect(versions).toHaveLength(1);
    const v1 = versions[0];
    expect(v1.state).toBe("published");
    expect(v1.publishedAt).toBeGreaterThan(0);
    expect(v1.publishedBy ?? null).toBe(v1.createdBy ?? null);
  });

  it("second published version archives the previous published version", async () => {
    const t = convexTest(schema, modules);

    // v1: published
    const v1 = await t.mutation(api.assetManager.commitVersion, {
      folderPath: "",
      basename: "cover.jpg",
      publish: true,
      label: "v1",
    });

    // v2: published
    const v2 = await t.mutation(api.assetManager.commitVersion, {
      folderPath: "",
      basename: "cover.jpg",
      publish: true,
      label: "v2",
      extra: { note: "second" },
    });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "cover.jpg",
    });

    expect(asset?.versionCounter).toBe(2);
    expect(asset?.publishedVersionId).toEqual(v2.versionId);
    expect(asset?.draftVersionId ?? null).toBeNull();

    const versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "",
      basename: "cover.jpg",
    });

    // Should have exactly v1 and v2
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);

    const byVersion = Object.fromEntries(
      versions.map((vv) => [vv.version, vv]),
    );

    const vv1 = byVersion[1];
    const vv2 = byVersion[2];

    expect(vv1.state).toBe("archived");
    expect(vv1.archivedAt).toBeGreaterThan(0);
    expect(vv1.archivedBy ?? null).toBe(vv2.publishedBy ?? null);

    expect(vv2.state).toBe("published");
    expect(vv2.label).toBe("v2");
    expect(vv2.extra).toEqual({ note: "second" });
  });

  it("commitVersion reuses an asset created via createAsset, bumping versionCounter", async () => {
    const t = convexTest(schema, modules);

    const preId = await t.mutation(api.assetManager.createAsset, {
      folderPath: "",
      basename: "config.json",
      extra: { kind: "config" },
    });

    const { assetId, version } = await t.mutation(
      api.assetManager.commitVersion,
      {
        folderPath: "",
        basename: "config.json",
        publish: true,
        label: "initial",
      },
    );

    expect(assetId).toEqual(preId);
    expect(version).toBe(1);

    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "config.json",
    });

    expect(asset?._id).toEqual(preId);
    expect(asset?.versionCounter).toBe(1);
  });

  it("publishDraft archives the existing published version when promoting a draft", async () => {
    const t = convexTest(schema, modules);

    // v1: published directly
    const v1 = await t.mutation(api.assetManager.commitVersion, {
      folderPath: "docs",
      basename: "readme.md",
      publish: true,
      label: "v1 published",
    });

    // v2: create as draft
    const v2 = await t.mutation(api.assetManager.commitVersion, {
      folderPath: "docs",
      basename: "readme.md",
      publish: false,
      label: "v2 draft",
    });

    // Verify initial state: v1 published, v2 draft
    let versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "docs",
      basename: "readme.md",
    });

    expect(versions).toHaveLength(2);
    let byVersion = Object.fromEntries(versions.map((v) => [v.version, v]));
    expect(byVersion[1].state).toBe("published");
    expect(byVersion[2].state).toBe("draft");

    // Now publish the draft - this should archive v1
    await t.mutation(api.assetManager.publishDraft, {
      folderPath: "docs",
      basename: "readme.md",
    });

    // Verify final state
    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "docs",
      basename: "readme.md",
    });

    expect(asset?.versionCounter).toBe(2);
    expect(asset?.draftVersionId ?? null).toBeNull();
    expect(asset?.publishedVersionId).toEqual(v2.versionId);

    versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "docs",
      basename: "readme.md",
    });

    expect(versions).toHaveLength(2);
    byVersion = Object.fromEntries(versions.map((v) => [v.version, v]));

    // v1 should now be archived
    const vv1 = byVersion[1];
    expect(vv1.state).toBe("archived");
    expect(vv1.archivedAt).toBeGreaterThan(0);
    expect(vv1.archivedBy ?? null).toBe(vv1.publishedBy ?? null); // same actor

    // v2 should now be published
    const vv2 = byVersion[2];
    expect(vv2.state).toBe("published");
    expect(vv2.publishedAt).toBeGreaterThan(0);
    expect(vv2.label).toBe("v2 draft");
  });

  it("getPublishedVersion returns null when nothing is published, and metadata when published", async () => {
    const t = convexTest(schema, modules);

    // Draft only
    await t.mutation(api.assetManager.commitVersion, {
      folderPath: "drafts",
      basename: "note.md",
      publish: false,
      label: "draft only",
    });

    let published = await t.query(api.assetManager.getPublishedVersion, {
      folderPath: "drafts",
      basename: "note.md",
    });

    expect(published).toBeNull();

    // Now publish
    await t.mutation(api.assetManager.publishDraft, {
      folderPath: "drafts",
      basename: "note.md",
    });

    published = await t.query(api.assetManager.getPublishedVersion, {
      folderPath: "drafts",
      basename: "note.md",
    });

    expect(published).not.toBeNull();
    expect(published?.folderPath).toBe("drafts");
    expect(published?.basename).toBe("note.md");
    expect(published?.version).toBe(1);
    expect(published?.state).toBe("published");
    expect(published?.createdAt).toBeGreaterThan(0);
    expect(published?.publishedAt).toBeGreaterThan(0);
  });

  it("restoreVersion creates a new version from an old one, preserving history", async () => {
    const t = convexTest(schema, modules);

    // Create fake files for testing
    const s1 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
      size: 100,
      contentType: "image/png",
    });
    const s2 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
      size: 200,
      contentType: "image/png",
    });

    // v1: initial published
    const v1 = await t.mutation(api.assetManager.createVersionFromStorageId, {
      folderPath: "",
      basename: "logo.png",
      storageId: s1,
      publish: true,
      label: "Initial logo",
    });

    // v2: replacement
    await t.mutation(api.assetManager.createVersionFromStorageId, {
      folderPath: "",
      basename: "logo.png",
      storageId: s2,
      publish: true,
      label: "New logo",
    });

    // Verify v1 is archived, v2 is published
    let versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "",
      basename: "logo.png",
    });
    expect(versions).toHaveLength(2);

    let byVersion = Object.fromEntries(versions.map((v) => [v.version, v]));
    expect(byVersion[1].state).toBe("archived");
    expect(byVersion[2].state).toBe("published");

    // Restore v1 - this should create v3 with same content as v1
    const restored = await t.mutation(api.assetManager.restoreVersion, {
      versionId: v1.versionId,
    });

    expect(restored.version).toBe(3);
    expect(restored.restoredFromVersion).toBe(1);

    // Check asset state
    const asset = await t.query(api.assetManager.getAsset, {
      folderPath: "",
      basename: "logo.png",
    });
    expect(asset?.versionCounter).toBe(3);
    expect(asset?.publishedVersionId).toEqual(restored.versionId);

    // Check version history: v1 archived, v2 archived, v3 published
    versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "",
      basename: "logo.png",
    });
    expect(versions).toHaveLength(3);

    byVersion = Object.fromEntries(versions.map((v) => [v.version, v]));
    expect(byVersion[1].state).toBe("archived");
    expect(byVersion[2].state).toBe("archived");
    expect(byVersion[3].state).toBe("published");
    expect(byVersion[3].label).toBe("Restored from v1");

    // Verify v3 has same storageId as v1
    expect(byVersion[3].storageId).toEqual(s1);
  });

  it("restoreVersion with custom label uses provided label", async () => {
    const t = convexTest(schema, modules);

    const s1 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
      size: 100,
      contentType: "application/json",
    });
    const s2 = await t.action(internal._testInsertFakeFile._testStoreFakeFile, {
      size: 200,
      contentType: "application/json",
    });

    const v1 = await t.mutation(api.assetManager.createVersionFromStorageId, {
      folderPath: "",
      basename: "config.json",
      storageId: s1,
      publish: true,
      label: "Original",
    });

    await t.mutation(api.assetManager.createVersionFromStorageId, {
      folderPath: "",
      basename: "config.json",
      storageId: s2,
      publish: true,
      label: "Updated",
    });

    await t.mutation(api.assetManager.restoreVersion, {
      versionId: v1.versionId,
      label: "Rollback per marketing request",
    });

    const versions = await t.query(api.assetManager.getAssetVersions, {
      folderPath: "",
      basename: "config.json",
    });

    const v3 = versions.find((v) => v.version === 3);
    expect(v3?.label).toBe("Rollback per marketing request");
  });
});
