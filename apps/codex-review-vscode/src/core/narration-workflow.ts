import type { AiChunkNarrationFile, AiChunkNarrationFileEntry, AiStoryStepsFile } from "./story-ai";
import type { ReviewChunk, ReviewLevel } from "./types";

export interface SetChunksPayload {
  ids: string[];
  explanation?: string;
  reasoning?: string;
  level?: ReviewLevel;
  title?: string;
  why?: string;
}

export interface NarrationListOptions {
  includeFiles?: string[];
  includePaths?: string[];
  offset?: number;
  limit?: number;
  pendingOnly?: boolean;
}

export interface NarrationProgress {
  total: number;
  authored: number;
  pending: number;
}

export interface NarrationListResult {
  items: Array<AiChunkNarrationFileEntry & { authored: boolean }>;
  progress: NarrationProgress;
  filteredTotal: number;
  filteredPending: number;
  shown: number;
  remainingFiltered: number;
  nextOffset: number;
}

export interface SyncNarrationResult {
  narration: AiChunkNarrationFile;
  changed: boolean;
}

function toTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRepoPath(filePath: string): string {
  const slashes = filePath.replaceAll("\\", "/");
  const withoutDot = slashes.replace(/^\.\/+/, "");
  return withoutDot.replace(/^\/+/, "").replace(/\/+$/, "");
}

function toNormalizedList(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .map((value) => normalizeRepoPath(value)),
    ),
  );
}

function fileMatchesPathPrefix(filePath: string, prefix: string): boolean {
  return filePath === prefix || filePath.startsWith(`${prefix}/`);
}

function toChunkMap(chunks: ReviewChunk[]): Map<string, ReviewChunk> {
  return new Map(chunks.map((chunk) => [chunk.id, chunk]));
}

function createDefaultNarrationEntry(chunk: ReviewChunk): AiChunkNarrationFileEntry {
  return {
    chunkId: chunk.id,
    filePath: chunk.filePath,
    preview: chunk.preview,
    explanation: chunk.explanation,
    reasoning: chunk.reasoning,
    authored: false,
  };
}

function isEntryAuthored(
  entry: AiChunkNarrationFileEntry,
  chunkMap: Map<string, ReviewChunk>,
): boolean {
  if (entry.authored === true) {
    return true;
  }
  if (entry.authored === false) {
    return false;
  }

  const chunk = chunkMap.get(entry.chunkId);
  if (!chunk) {
    return false;
  }
  return entry.explanation !== chunk.explanation || entry.reasoning !== chunk.reasoning;
}

function validatePayload(payload: SetChunksPayload): void {
  if (payload.ids.length === 0) {
    throw new Error("set-chunks requires at least one chunk id.");
  }

  const hasNarration = Boolean(payload.explanation) || Boolean(payload.reasoning);
  const hasAnyStepField = Boolean(payload.level) || Boolean(payload.title) || Boolean(payload.why);
  const hasFullStep = Boolean(payload.level && payload.title && payload.why);

  if (!hasNarration && !hasAnyStepField) {
    throw new Error(
      "set-chunks requires narration fields (explanation/reasoning) and/or step fields.",
    );
  }
  if (hasAnyStepField && !hasFullStep) {
    throw new Error("When setting a step, provide level, title, and why together.");
  }
}

export function parseSetChunksPayload(jsonText: string): SetChunksPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    throw new Error("Invalid JSON for --payload.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Payload must be a JSON object.");
  }
  const root = parsed as {
    ids?: unknown;
    explanation?: unknown;
    reasoning?: unknown;
    level?: unknown;
    title?: unknown;
    why?: unknown;
  };

  const ids = Array.isArray(root.ids)
    ? Array.from(
        new Set(
          root.ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()),
        ),
      ).filter((id) => id.length > 0)
    : [];
  const explanation = toTrimmed(root.explanation);
  const reasoning = toTrimmed(root.reasoning);
  const levelRaw = toTrimmed(root.level);
  const level =
    levelRaw === "high" || levelRaw === "mid" || levelRaw === "low" ? levelRaw : undefined;
  const title = toTrimmed(root.title);
  const why = toTrimmed(root.why);

  const payload: SetChunksPayload = { ids, explanation, reasoning, level, title, why };
  validatePayload(payload);
  return payload;
}

export function computeNarrationProgress(
  narration: AiChunkNarrationFile,
  chunks: ReviewChunk[],
): NarrationProgress {
  const chunkMap = toChunkMap(chunks);
  const total = narration.chunkNarration.length;
  const authored = narration.chunkNarration.filter((entry) =>
    isEntryAuthored(entry, chunkMap),
  ).length;
  return { total, authored, pending: Math.max(total - authored, 0) };
}

export function syncNarrationWithPlan(
  narration: AiChunkNarrationFile,
  chunks: ReviewChunk[],
): SyncNarrationResult {
  const byId = new Map(narration.chunkNarration.map((entry) => [entry.chunkId, entry]));
  const syncedEntries = chunks.map((chunk) => {
    const existing = byId.get(chunk.id);
    if (!existing) {
      return createDefaultNarrationEntry(chunk);
    }

    return {
      chunkId: chunk.id,
      filePath: chunk.filePath,
      preview: chunk.preview,
      explanation: existing.explanation,
      reasoning: existing.reasoning,
      authored: existing.authored,
      authoredAt: existing.authoredAt,
    };
  });

  const changed =
    syncedEntries.length !== narration.chunkNarration.length ||
    syncedEntries.some((entry, index) => {
      const previous = narration.chunkNarration[index];
      return (
        previous?.chunkId !== entry.chunkId ||
        previous?.filePath !== entry.filePath ||
        previous?.preview !== entry.preview ||
        previous?.explanation !== entry.explanation ||
        previous?.reasoning !== entry.reasoning ||
        previous?.authored !== entry.authored ||
        previous?.authoredAt !== entry.authoredAt
      );
    });

  return { narration: { chunkNarration: syncedEntries }, changed };
}

export function listNarrationEntries(
  narration: AiChunkNarrationFile,
  chunks: ReviewChunk[],
  options: NarrationListOptions,
): NarrationListResult {
  const includeFiles = toNormalizedList(options.includeFiles);
  const includePaths = toNormalizedList(options.includePaths);
  const hasScope = includeFiles.length > 0 || includePaths.length > 0;
  const includeFileSet = new Set(includeFiles);
  const chunkMap = toChunkMap(chunks);
  const pendingOnly = options.pendingOnly !== false;
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, options.limit ?? 10);

  const withStatus = narration.chunkNarration.map((entry) => ({
    ...entry,
    authored: isEntryAuthored(entry, chunkMap),
  }));

  const inScope = withStatus.filter((entry) => {
    if (!hasScope) {
      return true;
    }
    const normalizedPath = normalizeRepoPath(entry.filePath);
    if (includeFileSet.has(normalizedPath)) {
      return true;
    }
    return includePaths.some((prefix) => fileMatchesPathPrefix(normalizedPath, prefix));
  });

  const filtered = pendingOnly ? inScope.filter((entry) => !entry.authored) : inScope;
  const page = filtered.slice(offset, offset + limit);
  const nextOffset = offset + page.length;

  const progress = computeNarrationProgress(narration, chunks);
  const filteredPending = inScope.filter((entry) => !entry.authored).length;

  return {
    items: page,
    progress,
    filteredTotal: inScope.length,
    filteredPending,
    shown: page.length,
    remainingFiltered: Math.max(filtered.length - nextOffset, 0),
    nextOffset,
  };
}

export function applySetChunksToNarration(
  narration: AiChunkNarrationFile,
  payload: SetChunksPayload,
  chunks: ReviewChunk[],
  nowIso = new Date().toISOString(),
): { narration: AiChunkNarrationFile; updatedCount: number; missingIds: string[] } {
  const knownIds = new Set(chunks.map((chunk) => chunk.id));
  const targetIds = payload.ids.filter((id) => knownIds.has(id));
  const missingIds = payload.ids.filter((id) => !knownIds.has(id));
  const targetSet = new Set(targetIds);
  const hasNarrationUpdate = Boolean(payload.explanation || payload.reasoning);
  let updatedCount = 0;

  const updatedEntries = narration.chunkNarration.map((entry) => {
    if (!targetSet.has(entry.chunkId)) {
      return entry;
    }
    updatedCount += 1;
    return {
      ...entry,
      explanation: payload.explanation ?? entry.explanation,
      reasoning: payload.reasoning ?? entry.reasoning,
      authored: hasNarrationUpdate ? true : entry.authored,
      authoredAt: hasNarrationUpdate ? nowIso : entry.authoredAt,
    };
  });

  return { narration: { chunkNarration: updatedEntries }, updatedCount, missingIds };
}

export function applySetChunksToSteps(
  stepsFile: AiStoryStepsFile,
  payload: SetChunksPayload,
  knownChunkIds?: Set<string>,
): AiStoryStepsFile {
  if (!payload.level || !payload.title || !payload.why) {
    return stepsFile;
  }
  const chunkIds = Array.from(
    new Set(payload.ids.filter((chunkId) => (knownChunkIds ? knownChunkIds.has(chunkId) : true))),
  );
  if (chunkIds.length === 0) {
    return stepsFile;
  }
  return {
    ...stepsFile,
    steps: [
      ...stepsFile.steps,
      { level: payload.level, title: payload.title, why: payload.why, chunkIds },
    ],
  };
}
