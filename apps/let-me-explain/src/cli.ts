#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  applyAiStoryToPlan,
  applySetChunksToNarration,
  applySetChunksToSteps,
  buildReviewPlan,
  computeProgress,
  computeNarrationProgress,
  createAiChunkNarrationTemplate,
  createAiStorySeed,
  createAiStoryStepsTemplate,
  ensureStateMatchesPlan,
  getWorkspaceStatusFingerprint,
  listNarrationEntries,
  parseSetChunksPayload,
  readSessionLock,
  syncNarrationWithPlan,
  parseAiChunkNarrationFromJsonText,
  parseAiStoryOutputFromJsonText,
  parseAiStoryStepsFromJsonText,
  readReviewPlan,
  readReviewState,
  writeReviewArtifacts,
  writeReviewPlanAndTour,
  writeReviewState,
  writeSessionLock,
} from "./core";
import type { AiChunkNarrationFile, AiStoryOutput, AiStoryStepsFile } from "./core/story-ai";
import type { ReviewChunk, ReviewPlan, ReviewSessionLock, ReviewState } from "./core/types";

interface CliOptions {
  workspaceRoot: string;
  baseRef: string;
  storyFilePath?: string;
  stepsFilePath?: string;
  narrationFilePath?: string;
  seedOutPath?: string;
  stepsOutPath?: string;
  narrationOutPath?: string;
  storyInstructionsPath?: string;
  payloadText?: string;
  offset: number;
  limit: number;
  pendingOnly: boolean;
  includeFiles: string[];
  includePaths: string[];
}

const QUICK_BATCH_SIZE = 5;

interface BatchSuggestion {
  chunkId: string;
  filePath: string;
  line: number;
  stepId?: string;
  stepTitle?: string;
}

function valueFromEqualsArg(arg: string, prefix: string): string | undefined {
  if (!arg.startsWith(prefix)) {
    return undefined;
  }
  const value = arg.slice(prefix.length).trim();
  return value.length > 0 ? value : undefined;
}

function pushIfPresent(items: string[], value: string | undefined): void {
  if (!value) {
    return;
  }
  items.push(value);
}

function toNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

type ArgHandler = (options: CliOptions, nextValue: string | undefined) => void;

const ARG_HANDLERS: Record<string, ArgHandler> = {
  "--workspace": (options, nextValue) => {
    options.workspaceRoot = path.resolve(nextValue ?? options.workspaceRoot);
  },
  "-w": (options, nextValue) => {
    options.workspaceRoot = path.resolve(nextValue ?? options.workspaceRoot);
  },
  "--base-ref": (options, nextValue) => {
    options.baseRef = nextValue ?? options.baseRef;
  },
  "-b": (options, nextValue) => {
    options.baseRef = nextValue ?? options.baseRef;
  },
  "--story-file": (options, nextValue) => {
    options.storyFilePath = path.resolve(nextValue ?? "");
  },
  "-s": (options, nextValue) => {
    options.storyFilePath = path.resolve(nextValue ?? "");
  },
  "--steps-file": (options, nextValue) => {
    options.stepsFilePath = path.resolve(nextValue ?? "");
  },
  "--narration-file": (options, nextValue) => {
    options.narrationFilePath = path.resolve(nextValue ?? "");
  },
  "--seed-out": (options, nextValue) => {
    options.seedOutPath = path.resolve(nextValue ?? "");
  },
  "--steps-out": (options, nextValue) => {
    options.stepsOutPath = path.resolve(nextValue ?? "");
  },
  "--narration-out": (options, nextValue) => {
    options.narrationOutPath = path.resolve(nextValue ?? "");
  },
  "--story-instructions": (options, nextValue) => {
    options.storyInstructionsPath = path.resolve(nextValue ?? "");
  },
  "--payload": (options, nextValue) => {
    options.payloadText = nextValue;
  },
  "--offset": (options, nextValue) => {
    options.offset = toNonNegativeInt(nextValue, options.offset);
  },
  "--limit": (options, nextValue) => {
    options.limit = Math.max(1, toNonNegativeInt(nextValue, options.limit));
  },
  "--include": (options, nextValue) => {
    pushIfPresent(options.includeFiles, nextValue?.trim());
  },
  "--include-file": (options, nextValue) => {
    pushIfPresent(options.includeFiles, nextValue?.trim());
  },
  "--file": (options, nextValue) => {
    pushIfPresent(options.includeFiles, nextValue?.trim());
  },
  "--include-path": (options, nextValue) => {
    pushIfPresent(options.includePaths, nextValue?.trim());
  },
  "--path": (options, nextValue) => {
    pushIfPresent(options.includePaths, nextValue?.trim());
  },
};

function consumeArg(argv: string[], index: number, options: CliOptions): number {
  const arg = argv[index];

  const includeFromEquals =
    valueFromEqualsArg(arg, "--include=") ??
    valueFromEqualsArg(arg, "--include-file=") ??
    valueFromEqualsArg(arg, "--file=");
  if (includeFromEquals) {
    options.includeFiles.push(includeFromEquals);
    return index;
  }

  const includePathFromEquals =
    valueFromEqualsArg(arg, "--include-path=") ?? valueFromEqualsArg(arg, "--path=");
  if (includePathFromEquals) {
    options.includePaths.push(includePathFromEquals);
    return index;
  }

  const offsetFromEquals = valueFromEqualsArg(arg, "--offset=");
  if (offsetFromEquals) {
    options.offset = toNonNegativeInt(offsetFromEquals, options.offset);
    return index;
  }

  const limitFromEquals = valueFromEqualsArg(arg, "--limit=");
  if (limitFromEquals) {
    options.limit = Math.max(1, toNonNegativeInt(limitFromEquals, options.limit));
    return index;
  }

  const payloadFromEquals = valueFromEqualsArg(arg, "--payload=");
  if (payloadFromEquals) {
    options.payloadText = payloadFromEquals;
    return index;
  }

  if (arg === "--all") {
    options.pendingOnly = false;
    return index;
  }

  if (arg === "--pending-only") {
    options.pendingOnly = true;
    return index;
  }

  const handler = ARG_HANDLERS[arg];
  if (!handler) {
    if (arg.startsWith("{")) {
      options.payloadText = arg;
    }
    return index;
  }
  handler(options, argv[index + 1]);
  return index + 1;
}

function resolveCommand(argv: string[]): { command: string; startIndex: number } {
  const first = argv[0];
  if (!first) {
    return { command: "generate", startIndex: 0 };
  }

  if (first === "narration") {
    const second = argv[1];
    if (second === "list") {
      return { command: "narration-list", startIndex: 2 };
    }
    if (second === "setChunks" || second === "set-chunks" || second === "set") {
      return { command: "narration-set-chunks", startIndex: 2 };
    }
  }

  if (first === "start") {
    return { command: "generate", startIndex: 1 };
  }
  if (first === "chunks") {
    return { command: "narration-list", startIndex: 1 };
  }
  if (first === "set") {
    return { command: "narration-set-chunks", startIndex: 1 };
  }
  if (first === "continue") {
    return { command: "next-batch", startIndex: 1 };
  }

  return { command: first, startIndex: 1 };
}

function parseArgs(argv: string[]): { command: string; options: CliOptions } {
  const { command, startIndex } = resolveCommand(argv);
  const options: CliOptions = {
    workspaceRoot: process.cwd(),
    baseRef: "HEAD",
    offset: 0,
    limit: 10,
    pendingOnly: true,
    includeFiles: [],
    includePaths: [],
  };

  for (let index = startIndex; index < argv.length; index += 1) {
    index = consumeArg(argv, index, options);
  }

  return { command, options };
}

function printUsage(): void {
  console.log(
    "Usage:\n  bun run src/cli.ts start [--workspace <path>] [--base-ref <ref>] [--include-file <path>] [--include-path <path>]\n  bun run src/cli.ts status [--workspace <path>] [--narration-file <path>] [--limit <n>]\n  bun run src/cli.ts next-batch [--workspace <path>]   # alias: continue\n  bun run src/cli.ts chunks [--workspace <path>] [--file <path>] [--path <prefix>] [--offset <n>] [--limit <n>] [--all]\n  bun run src/cli.ts set --payload '<json>' [--workspace <path>] [--narration-file <path>] [--steps-file <path>]\n  bun run src/cli.ts narration list [--workspace <path>] [--file <path>] [--path <prefix>] [--offset <n>] [--limit <n>] [--all]\n  bun run src/cli.ts narration setChunks --payload '<json>' [--workspace <path>] [--narration-file <path>] [--steps-file <path>]\n  bun run src/cli.ts generate [--workspace <path>] [--base-ref <ref>] [--notes <path>] [--story-file <path>] [--seed-out <path>] [--steps-out <path>] [--narration-out <path>] [--include-file <path>] [--include-path <path>] [--include=<path>]\n  bun run src/cli.ts create-story-seed [--workspace <path>] [--base-ref <ref>] [--notes <path>] [--seed-out <path>] [--steps-out <path>] [--narration-out <path>] [--story-instructions <path>] [--include-file <path>] [--include-path <path>]\n  bun run src/cli.ts apply-story [--workspace <path>] [--story-file <path> | --steps-file <path>] [--narration-file <path>]\n  bun run src/cli.ts narration-list [--workspace <path>] [--narration-file <path>] [--offset <n>] [--limit <n>] [--all] [--include-file <path>] [--include-path <path>]\n  bun run src/cli.ts narration-set-chunks --payload '<json>' [--workspace <path>] [--narration-file <path>] [--steps-file <path>]",
  );
}

function loadStoryInstructions(storyInstructionsPath: string | undefined): string | undefined {
  if (!storyInstructionsPath) {
    return undefined;
  }
  if (!existsSync(storyInstructionsPath)) {
    throw new Error(`Story instructions file not found: ${storyInstructionsPath}`);
  }
  return readFileSync(storyInstructionsPath, "utf8");
}

function ensureParentDirectory(absolutePath: string): void {
  const directory = path.dirname(absolutePath);
  mkdirSync(directory, { recursive: true });
}

function writePrettyJson(absolutePath: string, value: unknown): void {
  ensureParentDirectory(absolutePath);
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toChunkLine(chunk: ReviewChunk): number {
  return Math.max(1, chunk.newStart > 0 ? chunk.newStart : chunk.oldStart);
}

function findStepForChunk(
  plan: ReviewPlan,
  chunkId: string,
): ReviewPlan["steps"][number] | undefined {
  return plan.steps.find((step) => step.chunkIds.includes(chunkId));
}

function toBatchSuggestion(plan: ReviewPlan, chunk: ReviewChunk): BatchSuggestion {
  const step = findStepForChunk(plan, chunk.id);
  return {
    chunkId: chunk.id,
    filePath: chunk.filePath,
    line: toChunkLine(chunk),
    stepId: step?.id,
    stepTitle: step ? `${step.level.toUpperCase()} · ${step.title}` : undefined,
  };
}

function selectNextBatch(
  plan: ReviewPlan,
  state: ReviewState,
  batchSize = QUICK_BATCH_SIZE,
): BatchSuggestion[] {
  const chunkById = new Map(plan.chunks.map((chunk) => [chunk.id, chunk]));
  const surfaced = new Set(state.surfacedChunkIds ?? []);
  const picked = new Set<string>();
  const selected: BatchSuggestion[] = [];

  for (const step of plan.steps) {
    for (const chunkId of step.chunkIds) {
      if (selected.length >= batchSize) {
        break;
      }
      if (picked.has(chunkId) || surfaced.has(chunkId)) {
        continue;
      }
      const status = state.chunkStatus[chunkId] ?? "unreviewed";
      if (status !== "unreviewed") {
        continue;
      }
      const chunk = chunkById.get(chunkId);
      if (!chunk) {
        continue;
      }
      picked.add(chunkId);
      selected.push(toBatchSuggestion(plan, chunk));
    }
    if (selected.length >= batchSize) {
      break;
    }
  }

  if (selected.length < batchSize) {
    for (const chunk of plan.chunks) {
      if (selected.length >= batchSize) {
        break;
      }
      if (picked.has(chunk.id) || surfaced.has(chunk.id)) {
        continue;
      }
      const status = state.chunkStatus[chunk.id] ?? "unreviewed";
      if (status !== "unreviewed") {
        continue;
      }
      picked.add(chunk.id);
      selected.push(toBatchSuggestion(plan, chunk));
    }
  }

  return selected;
}

function updateSurfacedChunks(state: ReviewState, selected: BatchSuggestion[]): ReviewState {
  const surfaced = new Set(state.surfacedChunkIds ?? []);
  for (const item of selected) {
    surfaced.add(item.chunkId);
  }
  return { ...state, surfacedChunkIds: Array.from(surfaced), updatedAt: new Date().toISOString() };
}

function formatBatchSuggestions(items: BatchSuggestion[], prefixLen = 12): string[] {
  return items.map((item, index) => {
    const shortId = item.chunkId.replace("chunk-", "").slice(0, prefixLen);
    const stepSuffix = item.stepTitle ? ` | ${item.stepTitle}` : "";
    return `${index + 1}. ${shortId} | ${item.filePath}:${item.line}${stepSuffix}`;
  });
}

function parseStoryFromFile(storyFilePath: string, plan: ReviewPlan): AiStoryOutput {
  if (!existsSync(storyFilePath)) {
    throw new Error(`Story file not found: ${storyFilePath}`);
  }
  const raw = readFileSync(storyFilePath, "utf8");
  const knownChunkIds = new Set(plan.chunks.map((chunk) => chunk.id));
  const story = parseAiStoryOutputFromJsonText(raw, knownChunkIds);
  if (!story) {
    throw new Error(`Story JSON in ${storyFilePath} is invalid for current chunk IDs.`);
  }
  return story;
}

function parseStoryStepsFromFile(
  stepsFilePath: string,
  plan: ReviewPlan,
): Pick<AiStoryOutput, "summary" | "steps"> {
  if (!existsSync(stepsFilePath)) {
    throw new Error(`Steps file not found: ${stepsFilePath}`);
  }

  const knownChunkIds = new Set(plan.chunks.map((chunk) => chunk.id));
  const raw = readFileSync(stepsFilePath, "utf8");
  const steps = parseAiStoryStepsFromJsonText(raw, knownChunkIds);
  if (!steps) {
    throw new Error(`Steps JSON in ${stepsFilePath} is invalid for current chunk IDs.`);
  }
  return steps;
}

function parseNarrationFromFile(
  narrationFilePath: string,
  plan: ReviewPlan,
): NonNullable<AiStoryOutput["chunkNarration"]> {
  if (!existsSync(narrationFilePath)) {
    throw new Error(`Narration file not found: ${narrationFilePath}`);
  }

  const knownChunkIds = new Set(plan.chunks.map((chunk) => chunk.id));
  const raw = readFileSync(narrationFilePath, "utf8");
  const narration = parseAiChunkNarrationFromJsonText(raw, knownChunkIds);
  if (!narration) {
    throw new Error(`Narration JSON in ${narrationFilePath} is invalid for current chunk IDs.`);
  }
  return narration;
}

function readNarrationTemplateFile(narrationFilePath: string): AiChunkNarrationFile {
  if (!existsSync(narrationFilePath)) {
    throw new Error(`Narration file not found: ${narrationFilePath}`);
  }
  const raw = readFileSync(narrationFilePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { chunkNarration?: unknown }).chunkNarration)
  ) {
    throw new Error(
      `Narration file at ${narrationFilePath} must contain { "chunkNarration": [...] }.`,
    );
  }
  return parsed as AiChunkNarrationFile;
}

function readStepsTemplateFile(stepsFilePath: string): AiStoryStepsFile {
  if (!existsSync(stepsFilePath)) {
    throw new Error(`Steps file not found: ${stepsFilePath}`);
  }
  const raw = readFileSync(stepsFilePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { steps?: unknown }).steps)
  ) {
    throw new Error(
      `Steps file at ${stepsFilePath} must contain { "summary": ..., "steps": [...] }.`,
    );
  }
  return parsed as AiStoryStepsFile;
}

function toStoryFromPlanDefaults(plan: ReviewPlan): AiStoryOutput {
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

function parseStoryFromSplitFiles(
  stepsFilePath: string | undefined,
  narrationFilePath: string | undefined,
  plan: ReviewPlan,
): AiStoryOutput {
  const baseStory = toStoryFromPlanDefaults(plan);
  const storyWithSteps = stepsFilePath
    ? { ...baseStory, ...parseStoryStepsFromFile(stepsFilePath, plan) }
    : baseStory;
  const chunkNarration = narrationFilePath
    ? parseNarrationFromFile(narrationFilePath, plan)
    : undefined;

  return { summary: storyWithSteps.summary, steps: storyWithSteps.steps, chunkNarration };
}

function tryReadState(workspaceRoot: string): ReviewState | undefined {
  try {
    return readReviewState(workspaceRoot);
  } catch {
    return undefined;
  }
}

function ensureReviewState(workspaceRoot: string, plan: ReviewPlan): ReviewState {
  const existing = tryReadState(workspaceRoot);
  return ensureStateMatchesPlan(workspaceRoot, plan, existing);
}

function toDefaultSeedOutPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".let-me-explain", "story-seed.json");
}

function toDefaultStepsOutPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".let-me-explain", "story-steps.json");
}

function toDefaultNarrationOutPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".let-me-explain", "chunk-narrations.json");
}

function toDefaultAgentBriefPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".let-me-explain", "agent-brief.txt");
}

function createSessionLock(plan: ReviewPlan, workspaceFingerprint: string): ReviewSessionLock {
  return {
    sessionId: plan.sessionId,
    baseRef: plan.baseRef,
    createdAt: new Date().toISOString(),
    diffHash: plan.diffHash,
    workspaceFingerprint,
  };
}

function relPath(absolute: string, workspaceRoot: string): string {
  const rel = path.relative(workspaceRoot, absolute);
  return rel || ".";
}

function quoteArg(value: string): string {
  return JSON.stringify(value);
}

function toIncludeArgs(options: CliOptions): string[] {
  const args: string[] = [];
  for (const includeFile of options.includeFiles) {
    args.push(`--include-file ${quoteArg(includeFile)}`);
  }
  for (const includePath of options.includePaths) {
    args.push(`--include-path ${quoteArg(includePath)}`);
  }
  return args;
}

function writeAgentBrief(
  workspaceRoot: string,
  plan: ReviewPlan,
  storyFiles: StoryAuthoringFiles,
  options: CliOptions,
): string {
  const briefPath = toDefaultAgentBriefPath(workspaceRoot);
  const applyCommand = [
    "bun run apps/let-me-explain/src/cli.ts apply-story",
    `--workspace ${quoteArg(workspaceRoot)}`,
    `--steps-file ${quoteArg(storyFiles.stepsPath)}`,
    `--narration-file ${quoteArg(storyFiles.narrationPath)}`,
  ].join(" ");
  const statusCommand = [
    "bun run apps/let-me-explain/src/cli.ts status",
    `--workspace ${quoteArg(workspaceRoot)}`,
  ].join(" ");
  const chunksCommand = [
    "bun run apps/let-me-explain/src/cli.ts chunks",
    `--workspace ${quoteArg(workspaceRoot)}`,
    "--limit 8",
    ...toIncludeArgs(options),
  ].join(" ");
  const setCommandExample = [
    "bun run apps/let-me-explain/src/cli.ts narration setChunks",
    `--workspace ${quoteArg(workspaceRoot)}`,
    `--payload '${JSON.stringify({
      ids: ["chunk-id"],
      narration: "Previously X was missing. Now Y handles it because Z.",
      level: "mid",
      title: "Short step title",
      why: "Why review this step now.",
    })}'`,
  ].join(" ");

  const content = [
    "Let Me Explain Agent Brief",
    "",
    `Session: ${plan.sessionId}`,
    `Chunks: ${plan.chunks.length}`,
    "",
    "Read-only context:",
    `- ${storyFiles.seedPath}`,
    "",
    "Editable files:",
    `- ${storyFiles.stepsPath}`,
    `- ${storyFiles.narrationPath}`,
    "",
    "Interactive flow:",
    `- Start is already done with first ${QUICK_BATCH_SIZE} suggested chunks.`,
    `- Get next suggested batch: bun run apps/let-me-explain/src/cli.ts next-batch --workspace ${quoteArg(workspaceRoot)}`,
    "",
    "Loop:",
    `1. Check progress and pending files: ${statusCommand}`,
    `2. Fetch pending chunks (optionally filtered by --file / --path): ${chunksCommand}`,
    `3. Update chunk narration / optional step: ${setCommandExample}`,
    `4. Apply story to review plan/tour: ${applyCommand}`,
    "",
    "Command aliases available:",
    "- `narration list` == `narration-list`",
    "- `narration setChunks` == `narration-set-chunks`",
    "- `start` == `generate`",
    "- `chunks` == `narration-list`",
    "- `set` == `narration-set-chunks`",
    "",
    "Rules:",
    "- Do not evaluate correctness or mark issues.",
    "- Each chunk narration should tell a connected story: what was the situation before, what changed, and why.",
    "- Vary the style naturally. Think 'Previously X. Now Y because Z.' but don't force a template.",
    "- Aim for ~5 steps. Group related chunks into the same step.",
    "- When test files are present, start with a step showing the tests — they reveal intent.",
    "- Order steps to build understanding: tests → core logic → integration → peripherals.",
    "- Use only existing chunk IDs. Every chunk must appear in at least one step.",
    "",
  ].join("\n");

  ensureParentDirectory(briefPath);
  writeFileSync(briefPath, content, "utf8");
  return briefPath;
}

interface StoryAuthoringFiles {
  seedPath: string;
  stepsPath: string;
  narrationPath: string;
}

function writeStoryAuthoringFiles(options: CliOptions, plan: ReviewPlan): StoryAuthoringFiles {
  const seedPath = options.seedOutPath ?? toDefaultSeedOutPath(options.workspaceRoot);
  const stepsPath = options.stepsOutPath ?? toDefaultStepsOutPath(options.workspaceRoot);
  const narrationPath =
    options.narrationOutPath ?? toDefaultNarrationOutPath(options.workspaceRoot);
  const storyInstructions = loadStoryInstructions(options.storyInstructionsPath);

  const seed = createAiStorySeed(plan, storyInstructions);
  const stepsTemplate = createAiStoryStepsTemplate(plan);
  const narrationTemplate = createAiChunkNarrationTemplate(plan);

  writePrettyJson(seedPath, seed);
  writePrettyJson(stepsPath, stepsTemplate);
  writePrettyJson(narrationPath, narrationTemplate);

  return { seedPath, stepsPath, narrationPath };
}

function runCreateStorySeed(options: CliOptions): void {
  const shouldRebuildPlan =
    options.includeFiles.length > 0 ||
    options.includePaths.length > 0 ||
    options.baseRef !== "HEAD";

  let plan: ReviewPlan;
  if (shouldRebuildPlan) {
    plan = buildReviewPlan({
      workspaceRoot: options.workspaceRoot,
      baseRef: options.baseRef,
      includeFiles: options.includeFiles,
      includePaths: options.includePaths,
    });
    writeReviewArtifacts(options.workspaceRoot, plan);
  } else {
    try {
      plan = readReviewPlan(options.workspaceRoot);
    } catch {
      plan = buildReviewPlan({ workspaceRoot: options.workspaceRoot, baseRef: options.baseRef });
      writeReviewArtifacts(options.workspaceRoot, plan);
    }
  }

  const storyFiles = writeStoryAuthoringFiles(options, plan);
  const sessionLock = createSessionLock(plan, getWorkspaceStatusFingerprint(options.workspaceRoot));
  writeSessionLock(options.workspaceRoot, sessionLock);
  const agentBriefPath = writeAgentBrief(options.workspaceRoot, plan, storyFiles, options);

  const r = (p: string) => relPath(p, options.workspaceRoot);
  console.log(`Session: ${plan.sessionId} | ${plan.chunks.length} chunks`);
  console.log(`Seed: ${r(storyFiles.seedPath)}`);
  console.log(`Brief: ${r(agentBriefPath)}`);
}

function resolveSplitStoryInputs(options: CliOptions): {
  stepsFilePath?: string;
  narrationFilePath?: string;
} {
  const defaultStepsFilePath = toDefaultStepsOutPath(options.workspaceRoot);
  const defaultNarrationFilePath = toDefaultNarrationOutPath(options.workspaceRoot);

  const stepsFilePath =
    options.stepsFilePath ?? (existsSync(defaultStepsFilePath) ? defaultStepsFilePath : undefined);
  const narrationFilePath =
    options.narrationFilePath ??
    (existsSync(defaultNarrationFilePath) ? defaultNarrationFilePath : undefined);

  return { stepsFilePath, narrationFilePath };
}

function runApplyStory(options: CliOptions): void {
  const existingPlan = readReviewPlan(options.workspaceRoot);

  const splitInputs = resolveSplitStoryInputs(options);
  const hasSplitInput = Boolean(splitInputs.stepsFilePath || splitInputs.narrationFilePath);
  if (!options.storyFilePath && !hasSplitInput) {
    throw new Error(
      "apply-story requires --story-file <path> or at least one of --steps-file / --narration-file (or their default files).",
    );
  }

  const story = options.storyFilePath
    ? parseStoryFromFile(options.storyFilePath, existingPlan)
    : parseStoryFromSplitFiles(
        splitInputs.stepsFilePath,
        splitInputs.narrationFilePath,
        existingPlan,
      );

  const updatedPlan = applyAiStoryToPlan(existingPlan, story);
  const narrationPath =
    splitInputs.narrationFilePath ?? toDefaultNarrationOutPath(options.workspaceRoot);
  const narration = readNarrationWithSync(options.workspaceRoot, existingPlan, narrationPath);
  const authoredChunkIds = new Set(
    narration.chunkNarration.filter((e) => e.authored).map((e) => e.chunkId),
  );
  writeReviewPlanAndTour(options.workspaceRoot, updatedPlan, authoredChunkIds);
  const existingState = tryReadState(options.workspaceRoot);
  ensureStateMatchesPlan(options.workspaceRoot, updatedPlan, existingState);

  const tourPath = path.join(
    options.workspaceRoot,
    ".tours",
    `review-${updatedPlan.sessionId}.tour`,
  );
  console.log(`Applied. Tour: ${relPath(tourPath, options.workspaceRoot)}`);
}

function readNarrationWithSync(
  workspaceRoot: string,
  plan: ReviewPlan,
  narrationPath: string,
): AiChunkNarrationFile {
  if (!existsSync(narrationPath)) {
    const initial = createAiChunkNarrationTemplate(plan);
    writePrettyJson(narrationPath, initial);
  }
  const narration = readNarrationTemplateFile(narrationPath);
  const synced = syncNarrationWithPlan(narration, plan.chunks);
  if (synced.changed) {
    writePrettyJson(narrationPath, synced.narration);
  }
  return synced.narration;
}

function toPendingByFile(
  narration: AiChunkNarrationFile,
  plan: ReviewPlan,
): Array<{ filePath: string; pending: number }> {
  const pendingEntries = listNarrationEntries(narration, plan.chunks, {
    pendingOnly: true,
    offset: 0,
    limit: Math.max(narration.chunkNarration.length, 1),
  }).items;
  const byFile = new Map<string, number>();
  for (const entry of pendingEntries) {
    byFile.set(entry.filePath, (byFile.get(entry.filePath) ?? 0) + 1);
  }
  return Array.from(byFile.entries())
    .map(([filePath, pending]) => ({ filePath, pending }))
    .sort(
      (left, right) => right.pending - left.pending || left.filePath.localeCompare(right.filePath),
    );
}

function runStatus(options: CliOptions): void {
  const plan = readReviewPlan(options.workspaceRoot);
  const state = ensureReviewState(options.workspaceRoot, plan);
  const reviewProgress = computeProgress(plan, state);
  const narrationPath =
    options.narrationFilePath ?? toDefaultNarrationOutPath(options.workspaceRoot);
  const narration = readNarrationWithSync(options.workspaceRoot, plan, narrationPath);
  const narrationProgress = computeNarrationProgress(narration, plan.chunks);
  const pendingByFile = toPendingByFile(narration, plan);
  const visibleLimit = Math.max(1, options.limit);

  let driftStatus = "unknown (missing session lock)";
  try {
    const lock = readSessionLock(options.workspaceRoot);
    const currentFingerprint = getWorkspaceStatusFingerprint(options.workspaceRoot);
    driftStatus = lock.workspaceFingerprint === currentFingerprint ? "clean" : "changed";
  } catch {
    driftStatus = "unknown (missing session lock)";
  }

  console.log(`Session: ${plan.sessionId} | drift: ${driftStatus}`);
  console.log(`Narration: ${narrationProgress.authored}/${narrationProgress.total}`);
  console.log(
    `Review: ${reviewProgress.total - reviewProgress.unreviewed}/${reviewProgress.total} labeled`,
  );
  if (pendingByFile.length > 0) {
    console.log(`Pending files:`);
    for (const item of pendingByFile.slice(0, visibleLimit)) {
      console.log(`  ${item.filePath}: ${item.pending}`);
    }
    if (pendingByFile.length > visibleLimit) {
      console.log(`  ... ${pendingByFile.length - visibleLimit} more`);
    }
  }
}

function runNextBatch(options: CliOptions): void {
  const plan = readReviewPlan(options.workspaceRoot);
  const state = ensureReviewState(options.workspaceRoot, plan);
  const selected = selectNextBatch(plan, state, QUICK_BATCH_SIZE);
  if (selected.length === 0) {
    console.log("No more unreviewed chunks.");
    return;
  }

  const updatedState = updateSurfacedChunks(state, selected);
  writeReviewState(options.workspaceRoot, updatedState);

  const allHashes = plan.chunks.map((c) => c.id.replace("chunk-", ""));
  const pLen = shortestUniquePrefix(allHashes);
  console.log(`Batch (${selected.length}):`);
  for (const line of formatBatchSuggestions(selected, pLen)) {
    console.log(line);
  }
}

function runNarrationList(options: CliOptions): void {
  const plan = readReviewPlan(options.workspaceRoot);
  const narrationPath =
    options.narrationFilePath ?? toDefaultNarrationOutPath(options.workspaceRoot);
  const syncedNarration = readNarrationWithSync(options.workspaceRoot, plan, narrationPath);
  const result = listNarrationEntries(syncedNarration, plan.chunks, {
    includeFiles: options.includeFiles,
    includePaths: options.includePaths,
    offset: options.offset,
    limit: options.limit,
    pendingOnly: options.pendingOnly,
  });

  console.log(`Progress: ${result.progress.authored}/${result.progress.total}`);
  console.log(
    JSON.stringify(
      {
        nextOffset: result.nextOffset,
        remaining: result.remainingFiltered,
        items: result.items.map((item) => ({
          chunkId: item.chunkId,
          filePath: item.filePath,
          preview: item.preview,
        })),
      },
      null,
      2,
    ),
  );
}

function startFreshSession(options: CliOptions): ReviewPlan {
  const plan = buildReviewPlan({
    workspaceRoot: options.workspaceRoot,
    baseRef: options.baseRef,
    includeFiles: options.includeFiles,
    includePaths: options.includePaths,
  });
  writeReviewArtifacts(options.workspaceRoot, plan);
  ensureReviewState(options.workspaceRoot, plan);
  writeStoryAuthoringFiles(options, plan);
  const sessionLock = createSessionLock(plan, getWorkspaceStatusFingerprint(options.workspaceRoot));
  writeSessionLock(options.workspaceRoot, sessionLock);
  return plan;
}

function ensureSession(options: CliOptions): ReviewPlan {
  let oldPlan: ReviewPlan | undefined;
  try {
    oldPlan = readReviewPlan(options.workspaceRoot);
  } catch {
    // No existing session
  }

  if (!oldPlan) {
    return startFreshSession(options);
  }

  // Check if diff changed since session was created
  const freshPlan = buildReviewPlan({
    workspaceRoot: options.workspaceRoot,
    baseRef: options.baseRef,
    includeFiles: options.includeFiles,
    includePaths: options.includePaths,
  });

  if (freshPlan.diffHash === oldPlan.diffHash) {
    return oldPlan;
  }

  // Diff changed — regenerate but preserve authored narrations for surviving chunks
  const narrationPath =
    options.narrationFilePath ?? toDefaultNarrationOutPath(options.workspaceRoot);
  const oldNarration = existsSync(narrationPath)
    ? readNarrationWithSync(options.workspaceRoot, oldPlan, narrationPath)
    : undefined;

  const authoredMap = new Map<string, { narration: string; authoredAt?: string }>();
  if (oldNarration) {
    for (const entry of oldNarration.chunkNarration) {
      if (entry.authored) {
        authoredMap.set(entry.chunkId, {
          narration: entry.narration,
          authoredAt: entry.authoredAt,
        });
      }
    }
  }

  writeReviewArtifacts(options.workspaceRoot, freshPlan);
  ensureReviewState(options.workspaceRoot, freshPlan);

  // Build new narration template, carrying over surviving authored entries
  const newNarration = createAiChunkNarrationTemplate(freshPlan);
  let preserved = 0;
  for (const entry of newNarration.chunkNarration) {
    const old = authoredMap.get(entry.chunkId);
    if (old) {
      entry.narration = old.narration;
      entry.authored = true;
      entry.authoredAt = old.authoredAt;
      preserved++;
    }
  }
  writePrettyJson(narrationPath, newNarration);

  // Rebuild steps + seed
  const stepsPath = options.stepsFilePath ?? toDefaultStepsOutPath(options.workspaceRoot);
  writePrettyJson(stepsPath, createAiStoryStepsTemplate(freshPlan));
  const seedPath = options.seedOutPath ?? toDefaultSeedOutPath(options.workspaceRoot);
  const storyInstructions = loadStoryInstructions(options.storyInstructionsPath);
  writePrettyJson(seedPath, createAiStorySeed(freshPlan, storyInstructions));

  const sessionLock = createSessionLock(
    freshPlan,
    getWorkspaceStatusFingerprint(options.workspaceRoot),
  );
  writeSessionLock(options.workspaceRoot, sessionLock);

  const lost = authoredMap.size - preserved;
  console.log(
    `Regenerated: ${freshPlan.chunks.length} chunks | ${preserved} narrations preserved` +
      (lost > 0 ? ` | ${lost} lost (chunks changed)` : ""),
  );

  return freshPlan;
}

function shortestUniquePrefix(ids: string[], min = 4): number {
  for (let len = min; len < 12; len++) {
    const prefixes = new Set(ids.map((id) => id.slice(0, len)));
    if (prefixes.size === ids.length) {
      return len;
    }
  }
  return 12;
}

function resolveChunkIds(partialIds: string[], knownIds: string[]): string[] {
  return partialIds.map((partial) => {
    // Already a full known ID
    if (knownIds.includes(partial)) {
      return partial;
    }
    // Strip chunk- prefix for matching
    const hash = partial.replace(/^chunk-/, "");
    const matches = knownIds.filter((id) => id.replace(/^chunk-/, "").startsWith(hash));
    if (matches.length === 1) {
      return matches[0]!;
    }
    if (matches.length > 1) {
      throw new Error(`Ambiguous chunk ID "${partial}" — matches: ${matches.join(", ")}`);
    }
    return partial; // Let downstream handle unknown
  });
}

function printReviewInstructions(plan: ReviewPlan, options: CliOptions): void {
  const narrationPath =
    options.narrationFilePath ?? toDefaultNarrationOutPath(options.workspaceRoot);
  const narration = readNarrationWithSync(options.workspaceRoot, plan, narrationPath);
  const progress = computeNarrationProgress(narration, plan.chunks);

  // Group chunks by file
  const byFile = new Map<string, ReviewChunk[]>();
  for (const chunk of plan.chunks) {
    const rel = relPath(path.resolve(options.workspaceRoot, chunk.filePath), options.workspaceRoot);
    const list = byFile.get(rel) ?? [];
    list.push(chunk);
    byFile.set(rel, list);
  }

  const tourRel = relPath(
    path.join(options.workspaceRoot, ".tours", `review-${plan.sessionId}.tour`),
    options.workspaceRoot,
  );

  const lines = [
    "=== Let Me Explain ===",
    "",
    "You made code changes in this workspace. This tool helps you explain them to",
    "the user through a CodeTour they read in VS Code alongside the actual diffs.",
    "",
    `Session: ${plan.sessionId}`,
    `Progress: ${progress.authored}/${progress.total} narrated`,
    `Tour: ${tourRel}`,
    "",
    "HOW IT WORKS:",
    "- You narrate chunks one at a time (or in small groups). Each narration is",
    "  saved and the tour file updates live — the user can open it immediately.",
    "- You decide the order. Start with tests (they show intent), then core logic,",
    "  then integration, then peripherals.",
    "- Each narration tells a story: what was the situation before, what changed, why.",
    "",
    "WORKFLOW:",
    "1. Pick ~5 chunks to narrate first. Use the previews below to orient.",
    "   If a preview isn't enough context, read the actual file before narrating.",
    "2. For each chunk, run:",
    `   bun explain '{"ids":["<short-id>"],"narration":"Previously X. Now Y because Z."}'`,
    "   The tour updates automatically. User can open it after the first save.",
    "3. Tell the user the first stops are ready and wait for feedback.",
    "4. If they ask questions, answer here. Rewrite narrations if the level is wrong",
    "   (too technical, missing context, wrong assumptions about their knowledge).",
    "5. When accepted, pick the next ~5 chunks. Run `bun explain` to see progress.",
    "",
    "TIPS:",
    "- Only group chunks if they are truly about the same logical change.",
    "  When in doubt, narrate separately — a wrong grouping puts the wrong",
    "  narration next to unrelated code in the tour.",
    "- Vary your style. Don't use a rigid template.",
    "- You can always re-narrate a chunk by sending the same id with new text.",
    "",
    `CHUNKS (${progress.authored}/${progress.total} narrated):`,
  ];

  const allHashes = plan.chunks.map((c) => c.id.replace("chunk-", ""));
  const prefixLen = shortestUniquePrefix(allHashes);

  for (const [filePath, chunks] of byFile) {
    lines.push(`  ${filePath} (${chunks.length}):`);
    lines.push("    chunk | lines | preview");
    for (const chunk of chunks) {
      const authored = narration.chunkNarration.find((n) => n.chunkId === chunk.id);
      const marker = authored && authored.narration !== chunk.narration ? " *" : "";
      const start = chunk.newStart > 0 ? chunk.newStart : chunk.oldStart;
      const span = chunk.newStart > 0 ? chunk.newLines : chunk.oldLines;
      const range = span > 1 ? `${start}-${start + span - 1}` : `${start}`;
      const shortId = chunk.id.replace("chunk-", "").slice(0, prefixLen);
      const preview =
        chunk.preview.length > 80 ? chunk.preview.slice(0, 77) + "..." : chunk.preview;
      lines.push(`    ${shortId} | ${range} | ${preview}${marker}`);
    }
  }

  console.log(lines.join("\n"));
}

function runNarrationSetChunks(options: CliOptions): void {
  if (!options.payloadText) {
    const plan = ensureSession(options);
    printReviewInstructions(plan, options);
    return;
  }

  const payload = parseSetChunksPayload(options.payloadText);
  const plan = readReviewPlan(options.workspaceRoot);
  const allChunkIds = plan.chunks.map((chunk) => chunk.id);
  payload.ids = resolveChunkIds(payload.ids, allChunkIds);
  const narrationPath =
    options.narrationFilePath ?? toDefaultNarrationOutPath(options.workspaceRoot);
  const stepsPath = options.stepsFilePath ?? toDefaultStepsOutPath(options.workspaceRoot);
  const syncedNarration = readNarrationWithSync(options.workspaceRoot, plan, narrationPath);
  const steps = existsSync(stepsPath)
    ? readStepsTemplateFile(stepsPath)
    : createAiStoryStepsTemplate(plan);
  const updatedNarrationResult = applySetChunksToNarration(syncedNarration, payload, plan.chunks);
  const knownChunkIds = new Set(allChunkIds);
  const updatedSteps = applySetChunksToSteps(steps, payload, knownChunkIds);
  if (updatedNarrationResult.updatedCount === 0) {
    throw new Error(
      "No chunk entries were updated. Check payload.ids against current review chunk IDs.",
    );
  }

  writePrettyJson(narrationPath, updatedNarrationResult.narration);
  writePrettyJson(stepsPath, updatedSteps);

  // Auto-apply: rebuild tour with only authored chunks
  const authoredChunkIds = new Set(
    updatedNarrationResult.narration.chunkNarration
      .filter((entry) => entry.authored)
      .map((entry) => entry.chunkId),
  );
  const story = parseStoryFromSplitFiles(stepsPath, narrationPath, plan);
  const updatedPlan = applyAiStoryToPlan(plan, story);
  writeReviewPlanAndTour(options.workspaceRoot, updatedPlan, authoredChunkIds);

  const progress = computeNarrationProgress(updatedNarrationResult.narration, plan.chunks);
  if (updatedNarrationResult.missingIds.length > 0) {
    console.log(`Ignored unknown IDs: ${updatedNarrationResult.missingIds.join(", ")}`);
  }
  console.log(`Progress: ${progress.authored}/${progress.total}`);
}

function main(): void {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "generate") {
    runNarrationSetChunks(options);
    return;
  }
  if (command === "create-story-seed") {
    runCreateStorySeed(options);
    return;
  }
  if (command === "status") {
    runStatus(options);
    return;
  }
  if (command === "next-batch") {
    runNextBatch(options);
    return;
  }
  if (command === "apply-story") {
    runApplyStory(options);
    return;
  }
  if (command === "narration-list") {
    runNarrationList(options);
    return;
  }
  if (command === "narration-set-chunks") {
    runNarrationSetChunks(options);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main();
