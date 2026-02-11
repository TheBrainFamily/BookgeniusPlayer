import type { ReviewChunk, ReviewPlan, ReviewStep } from "./types";

export interface AiStoryStep {
  level: "high" | "mid" | "low";
  title: string;
  why: string;
  chunkIds: string[];
}

export interface AiChunkNarration {
  chunkId: string;
  narration: string;
}

export interface AiStoryOutput {
  summary: { intent: string; areas?: string[] };
  steps: AiStoryStep[];
  chunkNarration?: AiChunkNarration[];
}

export interface AiStorySeedChunk {
  id: string;
  filePath: string;
  newStart: number;
  newLines: number;
  oldStart: number;
  oldLines: number;
  preview: string;
}

export interface AiStorySeed {
  instructions: string[];
  outputSchema: {
    summary: { intent: string; areas: string[] };
    steps: Array<{ level: "high" | "mid" | "low"; title: string; why: string; chunkIds: string[] }>;
    chunkNarration: Array<{ chunkId: string; narration: string }>;
  };
  summaryHint: { currentIntent: string; areas: string[] };
  chunks: AiStorySeedChunk[];
  extraInstructions?: string;
}

export interface AiStoryStepsFile {
  summary: { intent: string; areas?: string[] };
  steps: AiStoryStep[];
}

export interface AiChunkNarrationFileEntry {
  chunkId: string;
  filePath: string;
  preview: string;
  narration: string;
  authored?: boolean;
  authoredAt?: string;
}

export interface AiChunkNarrationFile {
  chunkNarration: AiChunkNarrationFileEntry[];
}

export const STORY_INSTRUCTIONS = [
  "Aim for ~5 steps. Group related chunks into the same step.",
  "When test files are present, start with a step showing the tests — they reveal intent.",
  "Each chunk narration should tell a connected story: what was the situation before, what changed, and why.",
  'Vary the style naturally. Think "Previously X. Now Y because Z." but don\'t force a template.',
  "Order steps to build understanding: tests → core logic → integration → peripherals.",
  "Do not evaluate correctness or mark issues.",
  "Use only provided chunk IDs. Every chunk must appear in at least one step.",
];

export const STORY_OUTPUT_SCHEMA_EXAMPLE: AiStorySeed["outputSchema"] = {
  summary: { intent: "string", areas: ["string"] },
  steps: [{ level: "high", title: "string", why: "string", chunkIds: ["chunk-id"] }],
  chunkNarration: [{ chunkId: "chunk-id", narration: "string" }],
};

function toTrimmed(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function sanitizeStepChunks(stepChunkIds: string[], knownChunkIds: Set<string>): string[] {
  return Array.from(new Set(stepChunkIds.filter((chunkId) => knownChunkIds.has(chunkId))));
}

function toNarrationMap(items: AiChunkNarration[] | undefined): Map<string, AiChunkNarration> {
  return new Map((items ?? []).map((item) => [item.chunkId, item]));
}

function applyNarration(
  chunks: ReviewChunk[],
  narrations: AiChunkNarration[] | undefined,
): ReviewChunk[] {
  const narrationMap = toNarrationMap(narrations);
  return chunks.map((chunk) => {
    const narration = narrationMap.get(chunk.id);
    if (!narration) {
      return chunk;
    }
    return { ...chunk, narration: narration.narration };
  });
}

function toFallbackMissingChunkSteps(
  chunks: ReviewChunk[],
  coveredChunkIds: Set<string>,
  startingIndex: number,
): ReviewStep[] {
  const missingChunks = chunks.filter((chunk) => !coveredChunkIds.has(chunk.id));
  return missingChunks.map((chunk, index) => ({
    id: `step-low-fallback-${startingIndex + index + 1}`,
    level: "low",
    title: `${chunk.filePath}:${chunk.newStart || chunk.oldStart}`,
    why: "Fallback step added to ensure this chunk is still reviewable.",
    files: [chunk.filePath],
    chunkIds: [chunk.id],
  }));
}

function parseSummary(
  rawSummary: { intent?: unknown; areas?: unknown } | undefined,
  fallbackIntent: string,
): { intent: string; areas?: string[] } {
  const intent = toTrimmed(rawSummary?.intent, fallbackIntent);
  const areas = Array.isArray(rawSummary?.areas)
    ? rawSummary.areas.filter((area): area is string => typeof area === "string")
    : undefined;
  return { intent, areas };
}

function parseSteps(rawSteps: unknown, knownChunkIds: Set<string>): AiStoryStep[] {
  const steps = Array.isArray(rawSteps) ? rawSteps : [];
  return steps
    .map((item) => {
      if (!item || typeof item !== "object") {
        return undefined;
      }
      const step = item as { level?: unknown; title?: unknown; why?: unknown; chunkIds?: unknown };
      const level = toTrimmed(step.level, "low");
      if (level !== "high" && level !== "mid" && level !== "low") {
        return undefined;
      }
      const chunkIds = Array.isArray(step.chunkIds)
        ? step.chunkIds
            .filter((id): id is string => typeof id === "string")
            .filter((id) => knownChunkIds.has(id))
        : [];
      if (chunkIds.length === 0) {
        return undefined;
      }
      return {
        level,
        title: toTrimmed(step.title, "Review step"),
        why: toTrimmed(step.why, "Understand this part before moving on."),
        chunkIds: Array.from(new Set(chunkIds)),
      };
    })
    .filter((step): step is AiStoryStep => Boolean(step));
}

function parseNarration(rawNarration: unknown, knownChunkIds: Set<string>): AiChunkNarration[] {
  const narrations = Array.isArray(rawNarration) ? rawNarration : [];
  return narrations
    .map((item) => {
      if (!item || typeof item !== "object") {
        return undefined;
      }
      const entry = item as { chunkId?: unknown; narration?: unknown };
      const chunkId = toTrimmed(entry.chunkId);
      if (!knownChunkIds.has(chunkId)) {
        return undefined;
      }
      const narration = toTrimmed(entry.narration);
      if (!narration) {
        return undefined;
      }
      return { chunkId, narration };
    })
    .filter((item): item is AiChunkNarration => Boolean(item));
}

export function createAiStorySeed(plan: ReviewPlan, extraInstructions?: string): AiStorySeed {
  return {
    instructions: [...STORY_INSTRUCTIONS],
    outputSchema: STORY_OUTPUT_SCHEMA_EXAMPLE,
    summaryHint: { currentIntent: plan.summary.intent, areas: plan.summary.areas },
    chunks: plan.chunks.map((chunk) => ({
      id: chunk.id,
      filePath: chunk.filePath,
      newStart: chunk.newStart,
      newLines: chunk.newLines,
      oldStart: chunk.oldStart,
      oldLines: chunk.oldLines,
      preview: chunk.preview,
    })),
    extraInstructions,
  };
}

export function createAiStoryStepsTemplate(plan: ReviewPlan): AiStoryStepsFile {
  return {
    summary: { intent: plan.summary.intent, areas: [...plan.summary.areas] },
    steps: plan.steps.map((step) => ({
      level: step.level,
      title: step.title,
      why: step.why,
      chunkIds: [...step.chunkIds],
    })),
  };
}

export function createAiChunkNarrationTemplate(plan: ReviewPlan): AiChunkNarrationFile {
  return {
    chunkNarration: plan.chunks.map((chunk) => ({
      chunkId: chunk.id,
      filePath: chunk.filePath,
      preview: chunk.preview,
      narration: chunk.narration,
      authored: false,
    })),
  };
}

export function parseAiStoryOutput(
  raw: unknown,
  knownChunkIds: Set<string>,
): AiStoryOutput | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const root = raw as {
    summary?: { intent?: unknown; areas?: unknown };
    steps?: unknown;
    chunkNarration?: unknown;
  };

  const steps = parseSteps(root.steps, knownChunkIds);
  if (steps.length === 0) {
    return undefined;
  }

  const summary = parseSummary(root.summary, "Guided review of current working-tree changes.");
  const chunkNarration = parseNarration(root.chunkNarration, knownChunkIds);

  return { summary, steps, chunkNarration };
}

export function parseAiStoryOutputFromJsonText(
  jsonText: string,
  knownChunkIds: Set<string>,
): AiStoryOutput | undefined {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return parseAiStoryOutput(parsed, knownChunkIds);
  } catch {
    return undefined;
  }
}

export function parseAiStoryStepsFromJsonText(
  jsonText: string,
  knownChunkIds: Set<string>,
): AiStoryStepsFile | undefined {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    const root = parsed as { summary?: { intent?: unknown; areas?: unknown }; steps?: unknown };
    const steps = parseSteps(root.steps, knownChunkIds);
    if (steps.length === 0) {
      return undefined;
    }
    const summary = parseSummary(root.summary, "Guided review of current working-tree changes.");
    return { summary, steps };
  } catch {
    return undefined;
  }
}

export function parseAiChunkNarrationFromJsonText(
  jsonText: string,
  knownChunkIds: Set<string>,
): AiChunkNarration[] | undefined {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (Array.isArray(parsed)) {
      return parseNarration(parsed, knownChunkIds);
    }
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    const root = parsed as { chunkNarration?: unknown };
    if (root.chunkNarration === undefined) {
      return undefined;
    }
    return parseNarration(root.chunkNarration, knownChunkIds);
  } catch {
    return undefined;
  }
}

export function applyAiStoryToPlan(plan: ReviewPlan, story: AiStoryOutput): ReviewPlan {
  const knownChunkIds = new Set(plan.chunks.map((chunk) => chunk.id));
  const covered = new Set<string>();

  const aiSteps: ReviewStep[] = story.steps.map((step, index) => {
    const validChunkIds = sanitizeStepChunks(step.chunkIds, knownChunkIds);
    for (const chunkId of validChunkIds) {
      covered.add(chunkId);
    }
    const files = Array.from(
      new Set(
        validChunkIds
          .map((chunkId) => plan.chunks.find((chunk) => chunk.id === chunkId))
          .filter((chunk): chunk is ReviewChunk => Boolean(chunk))
          .map((chunk) => chunk.filePath),
      ),
    );
    return {
      id: `step-ai-${index + 1}`,
      level: step.level,
      title: step.title,
      why: step.why,
      files,
      chunkIds: validChunkIds,
    };
  });

  const fallbackSteps = toFallbackMissingChunkSteps(plan.chunks, covered, aiSteps.length);
  const chunks = applyNarration(plan.chunks, story.chunkNarration);

  return {
    ...plan,
    summary: {
      intent: story.summary.intent,
      areas: story.summary.areas?.length ? story.summary.areas : plan.summary.areas,
    },
    steps: [...aiSteps.filter((step) => step.chunkIds.length > 0), ...fallbackSteps],
    chunks,
  };
}
