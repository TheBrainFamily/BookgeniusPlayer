import { describe, expect, it } from "bun:test";

import {
  applySetChunksToNarration,
  applySetChunksToSteps,
  computeNarrationProgress,
  listNarrationEntries,
  parseSetChunksPayload,
  syncNarrationWithPlan,
} from "../src/core/narration-workflow";
import type { AiChunkNarrationFile, AiStoryStepsFile } from "../src/core/story-ai";
import type { ReviewChunk } from "../src/core/types";

const CHUNKS: ReviewChunk[] = [
  {
    id: "chunk-1",
    filePath: "apps/player/src/a.ts",
    hunkIndex: 1,
    oldStart: 1,
    oldLines: 0,
    newStart: 1,
    newLines: 2,
    patch: "@@ -0,0 +1,2 @@",
    preview: "const a = 1;",
    explanation: "Adds a.",
    reasoning: "Needed for feature a.",
  },
  {
    id: "chunk-2",
    filePath: "apps/player/src/b.ts",
    hunkIndex: 1,
    oldStart: 1,
    oldLines: 0,
    newStart: 1,
    newLines: 2,
    patch: "@@ -0,0 +1,2 @@",
    preview: "const b = 1;",
    explanation: "Adds b.",
    reasoning: "Needed for feature b.",
  },
  {
    id: "chunk-3",
    filePath: "convex/functions/c.ts",
    hunkIndex: 1,
    oldStart: 1,
    oldLines: 0,
    newStart: 1,
    newLines: 2,
    patch: "@@ -0,0 +1,2 @@",
    preview: "export const c = 1;",
    explanation: "Adds c.",
    reasoning: "Needed for feature c.",
  },
];

function createNarrationFile(): AiChunkNarrationFile {
  return {
    chunkNarration: CHUNKS.map((chunk) => ({
      chunkId: chunk.id,
      filePath: chunk.filePath,
      preview: chunk.preview,
      explanation: chunk.explanation,
      reasoning: chunk.reasoning,
      authored: false,
    })),
  };
}

describe("parseSetChunksPayload", () => {
  it("parses valid payload", () => {
    const payload = parseSetChunksPayload(
      JSON.stringify({
        ids: ["chunk-1", "chunk-2", "chunk-2"],
        explanation: "Explains change",
        reasoning: "Explains why",
        level: "mid",
        title: "Reader changes",
        why: "Understand feature flow",
      }),
    );
    expect(payload.ids).toEqual(["chunk-1", "chunk-2"]);
    expect(payload.level).toBe("mid");
  });

  it("rejects partial step metadata", () => {
    expect(() =>
      parseSetChunksPayload(JSON.stringify({ ids: ["chunk-1"], title: "Missing level/why" })),
    ).toThrow();
  });

  it("rejects invalid json and non-object payload", () => {
    expect(() => parseSetChunksPayload("{")).toThrow("Invalid JSON for --payload.");
    expect(() => parseSetChunksPayload("[]")).toThrow("set-chunks requires at least one chunk id.");
    expect(() => parseSetChunksPayload("null")).toThrow("Payload must be a JSON object.");
  });

  it("rejects payload with no actionable fields", () => {
    expect(() => parseSetChunksPayload(JSON.stringify({ ids: ["chunk-1"] }))).toThrow(
      "set-chunks requires narration fields",
    );
  });
});

describe("listNarrationEntries", () => {
  it("supports pagination and include-path filtering", () => {
    const narration = createNarrationFile();
    narration.chunkNarration[0].authored = true;

    const page = listNarrationEntries(narration, CHUNKS, {
      includePaths: ["apps/player"],
      pendingOnly: true,
      offset: 0,
      limit: 1,
    });

    expect(page.progress.total).toBe(3);
    expect(page.progress.authored).toBe(1);
    expect(page.progress.pending).toBe(2);
    expect(page.filteredTotal).toBe(2);
    expect(page.filteredPending).toBe(1);
    expect(page.items.length).toBe(1);
    expect(page.items[0]?.chunkId).toBe("chunk-2");
    expect(page.remainingFiltered).toBe(0);
  });

  it("supports include-file normalization and --all mode", () => {
    const narration = createNarrationFile();
    narration.chunkNarration[0].authored = true;
    narration.chunkNarration[1].authored = true;
    const page = listNarrationEntries(narration, CHUNKS, {
      includeFiles: ["./apps/player/src/b.ts"],
      pendingOnly: false,
      offset: 0,
      limit: 10,
    });

    expect(page.filteredTotal).toBe(1);
    expect(page.filteredPending).toBe(0);
    expect(page.items.length).toBe(1);
    expect(page.items[0]?.chunkId).toBe("chunk-2");
    expect(page.items[0]?.authored).toBe(true);
  });

  it("infers authored status when authored flag is missing and text changed", () => {
    const narration = createNarrationFile();
    delete narration.chunkNarration[2].authored;
    narration.chunkNarration[2].explanation = "Changed narrative";
    const progress = computeNarrationProgress(narration, CHUNKS);
    expect(progress.authored).toBe(1);
    expect(progress.pending).toBe(2);
  });

  it("treats unknown chunk ids as not-authored in inferred mode", () => {
    const narration = createNarrationFile();
    narration.chunkNarration.push({
      chunkId: "chunk-missing",
      filePath: "apps/player/src/missing.ts",
      preview: "missing",
      explanation: "something",
      reasoning: "something",
    });

    const progress = computeNarrationProgress(narration, CHUNKS);
    expect(progress.total).toBe(4);
    expect(progress.authored).toBe(0);
    expect(progress.pending).toBe(4);
  });
});

describe("applySetChunksToNarration", () => {
  it("updates narration fields and authored markers", () => {
    const narration = createNarrationFile();
    const nowIso = "2026-02-10T00:00:00.000Z";
    const result = applySetChunksToNarration(
      narration,
      {
        ids: ["chunk-1", "chunk-missing"],
        explanation: "New explanation",
        reasoning: "New reasoning",
      },
      CHUNKS,
      nowIso,
    );

    expect(result.updatedCount).toBe(1);
    expect(result.missingIds).toEqual(["chunk-missing"]);
    const entry = result.narration.chunkNarration.find((item) => item.chunkId === "chunk-1");
    expect(entry?.explanation).toBe("New explanation");
    expect(entry?.reasoning).toBe("New reasoning");
    expect(entry?.authored).toBe(true);
    expect(entry?.authoredAt).toBe(nowIso);

    const progress = computeNarrationProgress(result.narration, CHUNKS);
    expect(progress.authored).toBe(1);
    expect(progress.pending).toBe(2);
  });

  it("does not force authored=true when only step fields are provided", () => {
    const narration = createNarrationFile();
    const result = applySetChunksToNarration(
      narration,
      {
        ids: ["chunk-2"],
        level: "mid",
        title: "Step only",
        why: "Step metadata without narration text",
      },
      CHUNKS,
      "2026-02-10T00:00:00.000Z",
    );

    const entry = result.narration.chunkNarration.find((item) => item.chunkId === "chunk-2");
    expect(entry?.authored).toBe(false);
    expect(entry?.authoredAt).toBeUndefined();
  });
});

describe("applySetChunksToSteps", () => {
  it("appends a manual step when full step metadata is provided", () => {
    const initial: AiStoryStepsFile = {
      summary: { intent: "Initial", areas: ["apps/player"] },
      steps: [
        {
          level: "high",
          title: "High-level overview",
          why: "Context first",
          chunkIds: ["chunk-1", "chunk-2", "chunk-3"],
        },
      ],
    };

    const next = applySetChunksToSteps(initial, {
      ids: ["chunk-2", "chunk-3"],
      level: "mid",
      title: "Player runtime behavior",
      why: "Review these changes together",
    });

    expect(next.steps.length).toBe(2);
    expect(next.steps[1]).toEqual({
      level: "mid",
      title: "Player runtime behavior",
      why: "Review these changes together",
      chunkIds: ["chunk-2", "chunk-3"],
    });
  });

  it("filters unknown chunk ids when known id set is provided", () => {
    const initial: AiStoryStepsFile = {
      summary: { intent: "Initial", areas: ["apps/player"] },
      steps: [],
    };
    const next = applySetChunksToSteps(
      initial,
      {
        ids: ["chunk-2", "chunk-missing"],
        level: "mid",
        title: "Known-only",
        why: "Ignore external ids",
      },
      new Set(["chunk-1", "chunk-2", "chunk-3"]),
    );

    expect(next.steps.length).toBe(1);
    expect(next.steps[0]?.chunkIds).toEqual(["chunk-2"]);
  });

  it("returns unchanged when step metadata is absent or ids are filtered out", () => {
    const initial: AiStoryStepsFile = {
      summary: { intent: "Initial", areas: ["apps/player"] },
      steps: [],
    };

    const noMetadata = applySetChunksToSteps(initial, { ids: ["chunk-1"] });
    expect(noMetadata).toEqual(initial);

    const filteredOut = applySetChunksToSteps(
      initial,
      { ids: ["chunk-missing"], level: "mid", title: "No known ids", why: "Should not append" },
      new Set(["chunk-1"]),
    );
    expect(filteredOut).toEqual(initial);
  });
});

describe("syncNarrationWithPlan", () => {
  it("syncs stale narration entries with current plan chunks", () => {
    const narration = createNarrationFile();
    narration.chunkNarration[0].authored = true;
    narration.chunkNarration[0].explanation = "Custom explanation";
    narration.chunkNarration.push({
      chunkId: "chunk-old",
      filePath: "old/file.ts",
      preview: "old",
      explanation: "old",
      reasoning: "old",
      authored: true,
    });

    const nextChunks = CHUNKS.slice(1);
    const synced = syncNarrationWithPlan(narration, nextChunks);

    expect(synced.changed).toBe(true);
    expect(synced.narration.chunkNarration.length).toBe(2);
    expect(synced.narration.chunkNarration[0]?.chunkId).toBe("chunk-2");
    expect(synced.narration.chunkNarration[1]?.chunkId).toBe("chunk-3");
    expect(synced.narration.chunkNarration.some((entry) => entry.chunkId === "chunk-old")).toBe(
      false,
    );
  });

  it("returns unchanged=false when narration already matches plan", () => {
    const narration = createNarrationFile();
    const synced = syncNarrationWithPlan(narration, CHUNKS);
    expect(synced.changed).toBe(false);
    expect(synced.narration).toEqual(narration);
  });

  it("adds default entries for new chunks introduced in plan", () => {
    const narration = createNarrationFile();
    const newChunk: ReviewChunk = {
      id: "chunk-4",
      filePath: "apps/player/src/new.ts",
      hunkIndex: 1,
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 1,
      patch: "@@ -0,0 +1,1 @@",
      preview: "const newValue = true;",
      explanation: "Adds new value",
      reasoning: "Support extra flow",
    };

    const synced = syncNarrationWithPlan(narration, [...CHUNKS, newChunk]);
    const added = synced.narration.chunkNarration.find((entry) => entry.chunkId === "chunk-4");

    expect(synced.changed).toBe(true);
    expect(added).toBeDefined();
    expect(added?.filePath).toBe("apps/player/src/new.ts");
    expect(added?.authored).toBe(false);
    expect(added?.explanation).toBe("Adds new value");
  });
});
