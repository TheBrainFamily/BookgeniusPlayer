import { describe, expect, it } from "bun:test";

import {
  applyAiStoryToPlan,
  createAiChunkNarrationTemplate,
  createAiStorySeed,
  createAiStoryStepsTemplate,
  parseAiChunkNarrationFromJsonText,
  parseAiStoryOutputFromJsonText,
  parseAiStoryStepsFromJsonText,
} from "../src/core/story-ai";
import type { ReviewPlan } from "../src/core/types";

function createPlan(): ReviewPlan {
  return {
    version: 1,
    sessionId: "session-1",
    baseRef: "HEAD",
    source: "working_tree",
    createdAt: "2026-02-10T00:00:00.000Z",
    diffHash: "hash",
    summary: { intent: "Initial summary", areas: ["apps/player"] },
    steps: [
      {
        id: "step-high-1",
        level: "high",
        title: "High-level overview",
        why: "Context",
        files: ["apps/player/src/a.ts", "apps/player/src/b.ts"],
        chunkIds: ["chunk-1", "chunk-2"],
      },
    ],
    chunks: [
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
    ],
  };
}

describe("story-ai templates", () => {
  it("creates seed and editable templates", () => {
    const plan = createPlan();
    const seed = createAiStorySeed(plan, "extra");
    const steps = createAiStoryStepsTemplate(plan);
    const narrations = createAiChunkNarrationTemplate(plan);

    expect(seed.instructions.length).toBeGreaterThan(0);
    expect(seed.summaryHint.currentIntent).toBe("Initial summary");
    expect(seed.chunks.length).toBe(2);
    expect(seed.extraInstructions).toBe("extra");

    expect(steps.steps.length).toBe(1);
    expect(steps.steps[0]?.chunkIds).toEqual(["chunk-1", "chunk-2"]);

    expect(narrations.chunkNarration.length).toBe(2);
    expect(narrations.chunkNarration[0]?.authored).toBe(false);
  });
});

describe("story-ai parsing", () => {
  it("parses story output and filters unknown chunks", () => {
    const knownChunkIds = new Set(["chunk-1", "chunk-2"]);
    const raw = JSON.stringify({
      summary: { intent: "Narrated summary", areas: ["apps/player"] },
      steps: [
        { level: "high", title: "Top", why: "Reason", chunkIds: ["chunk-1", "chunk-missing"] },
        { level: "bad", title: "Invalid", why: "Invalid", chunkIds: ["chunk-2"] },
      ],
      chunkNarration: [
        { chunkId: "chunk-1", explanation: "Updated explanation", reasoning: "Updated why" },
        { chunkId: "chunk-missing", explanation: "Ignore", reasoning: "Ignore" },
      ],
    });

    const parsed = parseAiStoryOutputFromJsonText(raw, knownChunkIds);
    expect(parsed).toBeDefined();
    expect(parsed?.steps.length).toBe(1);
    expect(parsed?.steps[0]?.chunkIds).toEqual(["chunk-1"]);
    expect(parsed?.chunkNarration?.length).toBe(1);
  });

  it("returns undefined for invalid story json", () => {
    const knownChunkIds = new Set(["chunk-1", "chunk-2"]);
    expect(parseAiStoryOutputFromJsonText("{", knownChunkIds)).toBeUndefined();
    expect(
      parseAiStoryOutputFromJsonText(JSON.stringify({ steps: [] }), knownChunkIds),
    ).toBeUndefined();
    expect(parseAiStoryOutputFromJsonText(JSON.stringify(null), knownChunkIds)).toBeUndefined();
  });

  it("parses story-steps and narration helper formats", () => {
    const knownChunkIds = new Set(["chunk-1", "chunk-2"]);
    const steps = parseAiStoryStepsFromJsonText(
      JSON.stringify({
        summary: { intent: "Intent", areas: ["apps/player"] },
        steps: [{ level: "mid", title: "Step", why: "Why", chunkIds: ["chunk-2"] }],
      }),
      knownChunkIds,
    );
    expect(steps?.steps.length).toBe(1);

    const narrationFromArray = parseAiChunkNarrationFromJsonText(
      JSON.stringify([{ chunkId: "chunk-1", explanation: "E", reasoning: "R" }]),
      knownChunkIds,
    );
    expect(narrationFromArray?.length).toBe(1);

    const narrationFromObject = parseAiChunkNarrationFromJsonText(
      JSON.stringify({
        chunkNarration: [{ chunkId: "chunk-2", explanation: "E2", reasoning: "R2" }],
      }),
      knownChunkIds,
    );
    expect(narrationFromObject?.length).toBe(1);

    expect(
      parseAiStoryStepsFromJsonText(JSON.stringify({ steps: [] }), knownChunkIds),
    ).toBeUndefined();
    expect(parseAiStoryStepsFromJsonText("{", knownChunkIds)).toBeUndefined();
    expect(parseAiStoryStepsFromJsonText(JSON.stringify(null), knownChunkIds)).toBeUndefined();
    expect(
      parseAiChunkNarrationFromJsonText(JSON.stringify({ notChunkNarration: [] }), knownChunkIds),
    ).toBeUndefined();
    expect(parseAiChunkNarrationFromJsonText("{", knownChunkIds)).toBeUndefined();
    expect(parseAiChunkNarrationFromJsonText(JSON.stringify(42), knownChunkIds)).toBeUndefined();
  });

  it("applies parser defaults for non-string fields and narration items", () => {
    const knownChunkIds = new Set(["chunk-1", "chunk-2"]);
    const parsed = parseAiStoryOutputFromJsonText(
      JSON.stringify({
        summary: { intent: 123, areas: [true, "apps/player"] },
        steps: [
          "skip-me",
          { level: "mid", title: "", why: "", chunkIds: ["chunk-1"] },
          { level: "mid", title: "No chunks", why: "No chunks", chunkIds: [] },
        ],
        chunkNarration: [
          "skip-me",
          { chunkId: "chunk-1", explanation: 42, reasoning: null },
          { chunkId: "chunk-2", explanation: "ok", reasoning: "ok" },
        ],
      }),
      knownChunkIds,
    );

    expect(parsed).toBeDefined();
    expect(parsed?.summary.intent).toBe("Guided review of current working-tree changes.");
    expect(parsed?.summary.areas).toEqual(["apps/player"]);
    expect(parsed?.steps.length).toBe(1);
    expect(parsed?.steps[0]?.title).toBe("Review step");
    expect(parsed?.steps[0]?.why).toBe("Understand this part before moving on.");
    expect(parsed?.chunkNarration?.length).toBe(2);
    expect(parsed?.chunkNarration?.[0]?.explanation).toBe("Describes what changed in this chunk.");
    expect(parsed?.chunkNarration?.[0]?.reasoning).toBe("Describes why this chunk exists.");
  });
});

describe("applyAiStoryToPlan", () => {
  it("applies narration, keeps unknown-safe ids, and adds fallback steps", () => {
    const plan = createPlan();
    const updated = applyAiStoryToPlan(plan, {
      summary: { intent: "Updated intent" },
      steps: [
        {
          level: "high",
          title: "Narrative order",
          why: "Start with one chunk",
          chunkIds: ["chunk-1", "chunk-missing"],
        },
      ],
      chunkNarration: [
        {
          chunkId: "chunk-1",
          explanation: "Narrated explanation",
          reasoning: "Narrated reasoning",
        },
      ],
    });

    expect(updated.summary.intent).toBe("Updated intent");
    expect(updated.summary.areas).toEqual(["apps/player"]);
    expect(updated.steps.length).toBe(2);
    expect(updated.steps[0]?.id).toBe("step-ai-1");
    expect(updated.steps[0]?.chunkIds).toEqual(["chunk-1"]);
    expect(updated.steps[1]?.id).toBe("step-low-fallback-2");
    expect(updated.steps[1]?.chunkIds).toEqual(["chunk-2"]);
    expect(updated.chunks.find((chunk) => chunk.id === "chunk-1")?.explanation).toBe(
      "Narrated explanation",
    );
  });
});
