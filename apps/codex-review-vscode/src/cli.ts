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
  getSessionLockPath,
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
  STORY_INSTRUCTIONS,
  STORY_OUTPUT_SCHEMA_EXAMPLE,
  writeReviewArtifacts,
  writeReviewPlanAndTour,
  writeReviewState,
  writeSessionLock,
} from "./core";
import type { AiChunkNarrationFile, AiStoryOutput, AiStoryStepsFile } from "./core/story-ai";
import type {
  AuthorNotes,
  ReviewChunk,
  ReviewPlan,
  ReviewSessionLock,
  ReviewState,
} from "./core/types";

interface CliOptions {
  workspaceRoot: string;
  baseRef: string;
  notesPath?: string;
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
  "--notes": (options, nextValue) => {
    options.notesPath = path.resolve(nextValue ?? "");
  },
  "-n": (options, nextValue) => {
    options.notesPath = path.resolve(nextValue ?? "");
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

function loadAuthorNotes(notesPath: string | undefined): AuthorNotes | undefined {
  if (!notesPath) {
    return undefined;
  }
  if (!existsSync(notesPath)) {
    throw new Error(`Notes file not found: ${notesPath}`);
  }
  const raw = readFileSync(notesPath, "utf8");
  return JSON.parse(raw) as AuthorNotes;
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

function formatBatchSuggestions(items: BatchSuggestion[]): string[] {
  return items.map((item, index) => {
    const stepSuffix = item.stepTitle ? ` | ${item.stepTitle}` : "";
    return `${index + 1}. ${item.chunkId} | ${item.filePath}:${item.line}${stepSuffix}`;
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
  return path.join(workspaceRoot, ".codex-review", "story-seed.json");
}

function toDefaultStepsOutPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".codex-review", "story-steps.json");
}

function toDefaultNarrationOutPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".codex-review", "chunk-narrations.json");
}

function toDefaultStoryOutPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".codex-review", "story.json");
}

function toDefaultAgentBriefPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".codex-review", "agent-brief.txt");
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

function logScopeHint(options: CliOptions): void {
  if (options.includeFiles.length === 0 && options.includePaths.length === 0) {
    console.log("Scope: full working tree.");
    return;
  }
  if (options.includeFiles.length > 0) {
    console.log(`Scope include files: ${options.includeFiles.join(", ")}`);
  }
  if (options.includePaths.length > 0) {
    console.log(`Scope include paths: ${options.includePaths.join(", ")}`);
  }
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
    "bun run apps/codex-review-vscode/src/cli.ts apply-story",
    `--workspace ${quoteArg(workspaceRoot)}`,
    `--steps-file ${quoteArg(storyFiles.stepsPath)}`,
    `--narration-file ${quoteArg(storyFiles.narrationPath)}`,
  ].join(" ");
  const statusCommand = [
    "bun run apps/codex-review-vscode/src/cli.ts status",
    `--workspace ${quoteArg(workspaceRoot)}`,
  ].join(" ");
  const chunksCommand = [
    "bun run apps/codex-review-vscode/src/cli.ts chunks",
    `--workspace ${quoteArg(workspaceRoot)}`,
    "--limit 8",
    ...toIncludeArgs(options),
  ].join(" ");
  const setCommandExample = [
    "bun run apps/codex-review-vscode/src/cli.ts narration setChunks",
    `--workspace ${quoteArg(workspaceRoot)}`,
    `--payload '${JSON.stringify({
      ids: ["chunk-id"],
      explanation: "What changed in this chunk.",
      reasoning: "Why this chunk exists.",
      level: "mid",
      title: "Short step title",
      why: "Why review this step now.",
    })}'`,
  ].join(" ");

  const content = [
    "Codex Review Agent Brief",
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
    `- Get next suggested batch: bun run apps/codex-review-vscode/src/cli.ts next-batch --workspace ${quoteArg(workspaceRoot)}`,
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
    "- Do not evaluate correctness.",
    "- Describe what changed and why.",
    "- Use only existing chunk IDs.",
    "- Ensure every chunk appears in at least one step.",
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

function logStoryGuidance(): void {
  console.log("Story instructions:");
  for (const instruction of STORY_INSTRUCTIONS) {
    console.log(`- ${instruction}`);
  }
  console.log("Output schema:");
  console.log(JSON.stringify(STORY_OUTPUT_SCHEMA_EXAMPLE, null, 2));
}

function logNarrationPreview(options: CliOptions, narrationPath: string, plan: ReviewPlan): void {
  const previewLimit = 8;
  const narrationTemplate = createAiChunkNarrationTemplate(plan);
  const result = listNarrationEntries(narrationTemplate, plan.chunks, {
    limit: previewLimit,
    offset: 0,
    pendingOnly: true,
  });

  console.log(
    `Narration progress: ${result.progress.authored}/${result.progress.total} authored, ${result.progress.pending} remaining.`,
  );

  if (result.progress.total <= previewLimit) {
    return;
  }

  console.log(
    `Large narration file detected (${result.progress.total} chunks). Showing first ${result.shown}:`,
  );
  for (const item of result.items) {
    console.log(`- ${item.chunkId} | ${item.filePath} | ${item.preview}`);
  }

  const listCommand = [
    "bun run apps/codex-review-vscode/src/cli.ts narration-list",
    `--workspace ${quoteArg(options.workspaceRoot)}`,
    `--narration-file ${quoteArg(narrationPath)}`,
    `--offset ${result.nextOffset}`,
    `--limit ${previewLimit}`,
    ...toIncludeArgs(options),
  ].join(" ");
  console.log(`To continue listing pending chunks: ${listCommand}`);
}

function runGenerate(options: CliOptions): void {
  const notes = loadAuthorNotes(options.notesPath);
  const baselinePlan = buildReviewPlan({
    workspaceRoot: options.workspaceRoot,
    baseRef: options.baseRef,
    notes,
    includeFiles: options.includeFiles,
    includePaths: options.includePaths,
  });

  const finalPlan = options.storyFilePath
    ? applyAiStoryToPlan(baselinePlan, parseStoryFromFile(options.storyFilePath, baselinePlan))
    : baselinePlan;

  writeReviewArtifacts(options.workspaceRoot, finalPlan);
  const state = ensureReviewState(options.workspaceRoot, finalPlan);
  const initialBatch = selectNextBatch(finalPlan, state, QUICK_BATCH_SIZE);
  if (initialBatch.length > 0) {
    const updatedState = updateSurfacedChunks(state, initialBatch);
    writeReviewState(options.workspaceRoot, updatedState);
  }
  const storyFiles = writeStoryAuthoringFiles(options, finalPlan);
  const sessionLock = createSessionLock(
    finalPlan,
    getWorkspaceStatusFingerprint(options.workspaceRoot),
  );
  writeSessionLock(options.workspaceRoot, sessionLock);
  const agentBriefPath = writeAgentBrief(options.workspaceRoot, finalPlan, storyFiles, options);

  const planPath = path.join(options.workspaceRoot, ".codex-review", "review-plan.json");
  const statePath = path.join(options.workspaceRoot, ".codex-review", "review-state.json");
  const tourPath = path.join(options.workspaceRoot, ".tours", `review-${finalPlan.sessionId}.tour`);
  const storyPath = toDefaultStoryOutPath(options.workspaceRoot);
  const applyCommand = [
    "bun run apps/codex-review-vscode/src/cli.ts apply-story",
    `--workspace ${quoteArg(options.workspaceRoot)}`,
    `--steps-file ${quoteArg(storyFiles.stepsPath)}`,
    `--narration-file ${quoteArg(storyFiles.narrationPath)}`,
  ].join(" ");

  console.log(`Generated review session ${finalPlan.sessionId}`);
  logScopeHint(options);
  if (options.storyFilePath) {
    console.log(`Applied story file: ${options.storyFilePath}`);
  }
  console.log(`Plan: ${planPath}`);
  console.log(`State: ${statePath}`);
  console.log(`CodeTour: ${tourPath}`);
  console.log(`Story seed (read-only context): ${storyFiles.seedPath}`);
  console.log(`Story steps (edit): ${storyFiles.stepsPath}`);
  console.log(`Chunk narrations (edit): ${storyFiles.narrationPath}`);
  console.log(`Agent brief: ${agentBriefPath}`);
  if (initialBatch.length > 0) {
    console.log(`Quick interactive batch (${initialBatch.length} chunk(s)):`);
    for (const line of formatBatchSuggestions(initialBatch)) {
      console.log(line);
    }
    console.log(
      `Continue when ready: bun run apps/codex-review-vscode/src/cli.ts next-batch --workspace ${quoteArg(options.workspaceRoot)}`,
    );
  }
  console.log(`Optional single-file story target: ${storyPath}`);
  console.log(`Next: update ${storyFiles.stepsPath} and/or ${storyFiles.narrationPath}.`);
  console.log(`Then run: ${applyCommand}`);
  console.log(
    `Status anytime: bun run apps/codex-review-vscode/src/cli.ts status --workspace ${quoteArg(options.workspaceRoot)}`,
  );
  console.log("Alternative: provide --story-file with full story JSON in the previous schema.");
  console.log(
    "Tip: scope to a subset with --include-file path/to/file.ts or --include-path apps/player (repeatable).",
  );
  logNarrationPreview(options, storyFiles.narrationPath, finalPlan);
  logStoryGuidance();
}

function runCreateStorySeed(options: CliOptions): void {
  const shouldRebuildPlan =
    options.includeFiles.length > 0 ||
    options.includePaths.length > 0 ||
    Boolean(options.notesPath) ||
    options.baseRef !== "HEAD";

  let plan: ReviewPlan;
  if (shouldRebuildPlan) {
    const notes = loadAuthorNotes(options.notesPath);
    plan = buildReviewPlan({
      workspaceRoot: options.workspaceRoot,
      baseRef: options.baseRef,
      notes,
      includeFiles: options.includeFiles,
      includePaths: options.includePaths,
    });
    writeReviewArtifacts(options.workspaceRoot, plan);
  } else {
    try {
      plan = readReviewPlan(options.workspaceRoot);
    } catch {
      const notes = loadAuthorNotes(options.notesPath);
      plan = buildReviewPlan({
        workspaceRoot: options.workspaceRoot,
        baseRef: options.baseRef,
        notes,
      });
      writeReviewArtifacts(options.workspaceRoot, plan);
    }
  }

  const storyFiles = writeStoryAuthoringFiles(options, plan);
  const sessionLock = createSessionLock(plan, getWorkspaceStatusFingerprint(options.workspaceRoot));
  writeSessionLock(options.workspaceRoot, sessionLock);
  const agentBriefPath = writeAgentBrief(options.workspaceRoot, plan, storyFiles, options);
  const applyCommand = [
    "bun run apps/codex-review-vscode/src/cli.ts apply-story",
    `--workspace ${quoteArg(options.workspaceRoot)}`,
    `--steps-file ${quoteArg(storyFiles.stepsPath)}`,
    `--narration-file ${quoteArg(storyFiles.narrationPath)}`,
  ].join(" ");

  console.log(`Story seed written: ${storyFiles.seedPath}`);
  console.log(`Story steps template written: ${storyFiles.stepsPath}`);
  console.log(`Chunk narration template written: ${storyFiles.narrationPath}`);
  console.log(`Agent brief: ${agentBriefPath}`);
  console.log(`Next: update ${storyFiles.stepsPath} and/or ${storyFiles.narrationPath}.`);
  console.log(`Then run: ${applyCommand}`);
  logNarrationPreview(options, storyFiles.narrationPath, plan);
  logStoryGuidance();
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
  writeReviewPlanAndTour(options.workspaceRoot, updatedPlan);
  const existingState = tryReadState(options.workspaceRoot);
  ensureStateMatchesPlan(options.workspaceRoot, updatedPlan, existingState);

  const planPath = path.join(options.workspaceRoot, ".codex-review", "review-plan.json");
  const tourPath = path.join(
    options.workspaceRoot,
    ".tours",
    `review-${updatedPlan.sessionId}.tour`,
  );
  if (options.storyFilePath) {
    console.log(`Applied story file: ${options.storyFilePath}`);
  } else {
    if (splitInputs.stepsFilePath) {
      console.log(`Applied steps file: ${splitInputs.stepsFilePath}`);
    } else {
      console.log("Applied steps: existing plan steps (no custom steps file provided).");
    }
    if (splitInputs.narrationFilePath) {
      console.log(`Applied narration file: ${splitInputs.narrationFilePath}`);
    }
  }
  console.log(`Updated plan: ${planPath}`);
  console.log(`Updated tour: ${tourPath}`);
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

  console.log(`Session: ${plan.sessionId}`);
  console.log(`Lock file: ${getSessionLockPath(options.workspaceRoot)}`);
  console.log(`Working tree since session: ${driftStatus}`);
  console.log(
    `Review labels: ${reviewProgress.total - reviewProgress.unreviewed}/${reviewProgress.total} labeled (${reviewProgress.unreviewed} unreviewed).`,
  );
  console.log(
    `Narration: ${narrationProgress.authored}/${narrationProgress.total} authored (${narrationProgress.pending} remaining).`,
  );
  const viewedCount = new Set(state.viewedChunkIds ?? []).size;
  console.log(`Viewed chunks: ${viewedCount}/${plan.chunks.length}`);
  if (state.lastOpenedChunkId) {
    const lastChunk = plan.chunks.find((chunk) => chunk.id === state.lastOpenedChunkId);
    if (lastChunk) {
      console.log(`Last opened: ${lastChunk.filePath}:${toChunkLine(lastChunk)} (${lastChunk.id})`);
    }
  }
  console.log(
    `Surfaced in batches: ${(state.surfacedChunkIds ?? []).length}/${plan.chunks.length}`,
  );
  console.log(`Files with pending narration: ${pendingByFile.length}`);
  for (const item of pendingByFile.slice(0, visibleLimit)) {
    console.log(`- ${item.filePath}: ${item.pending}`);
  }
  if (pendingByFile.length > visibleLimit) {
    console.log(`... ${pendingByFile.length - visibleLimit} more file(s).`);
  }

  if (narrationProgress.pending > 0) {
    const firstFile = pendingByFile[0]?.filePath;
    if (firstFile) {
      const nextChunksCommand = [
        "bun run apps/codex-review-vscode/src/cli.ts chunks",
        `--workspace ${quoteArg(options.workspaceRoot)}`,
        `--file ${quoteArg(firstFile)}`,
        "--limit 8",
      ].join(" ");
      console.log(`Next action: ${nextChunksCommand}`);
    }
  } else {
    const applyCommand = [
      "bun run apps/codex-review-vscode/src/cli.ts apply-story",
      `--workspace ${quoteArg(options.workspaceRoot)}`,
      `--steps-file ${quoteArg(toDefaultStepsOutPath(options.workspaceRoot))}`,
      `--narration-file ${quoteArg(narrationPath)}`,
    ].join(" ");
    console.log(`Next action: apply story to plan/tour with ${applyCommand}`);
  }
}

function runNextBatch(options: CliOptions): void {
  const plan = readReviewPlan(options.workspaceRoot);
  const state = ensureReviewState(options.workspaceRoot, plan);
  const selected = selectNextBatch(plan, state, QUICK_BATCH_SIZE);
  if (selected.length === 0) {
    console.log("No additional unreviewed chunks available for a new batch.");
    console.log(
      `Status: bun run apps/codex-review-vscode/src/cli.ts status --workspace ${quoteArg(options.workspaceRoot)}`,
    );
    return;
  }

  const updatedState = updateSurfacedChunks(state, selected);
  writeReviewState(options.workspaceRoot, updatedState);

  console.log(`Suggested review batch (${selected.length} chunk(s)):`); // interactive continuation
  for (const line of formatBatchSuggestions(selected)) {
    console.log(line);
  }
  console.log(
    `If user accepts/questions this batch, continue with: bun run apps/codex-review-vscode/src/cli.ts next-batch --workspace ${quoteArg(options.workspaceRoot)}`,
  );
  console.log(
    `Inspect one file in detail: bun run apps/codex-review-vscode/src/cli.ts chunks --workspace ${quoteArg(options.workspaceRoot)} --file ${quoteArg(selected[0].filePath)} --limit 8`,
  );
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

  console.log(`Narration file: ${narrationPath}`);
  logScopeHint(options);
  console.log(
    `Progress: ${result.progress.authored}/${result.progress.total} authored, ${result.progress.pending} remaining.`,
  );
  console.log(
    `Scope: ${result.filteredPending}/${result.filteredTotal} pending, showing ${result.shown}, ${result.remainingFiltered} still hidden by pagination.`,
  );
  console.log(
    JSON.stringify(
      {
        offset: options.offset,
        limit: options.limit,
        pendingOnly: options.pendingOnly,
        nextOffset: result.nextOffset,
        items: result.items.map((item) => ({
          chunkId: item.chunkId,
          filePath: item.filePath,
          preview: item.preview,
          authored: item.authored,
        })),
      },
      null,
      2,
    ),
  );

  if (result.remainingFiltered > 0) {
    const nextCommand = [
      "bun run apps/codex-review-vscode/src/cli.ts narration-list",
      `--workspace ${quoteArg(options.workspaceRoot)}`,
      `--narration-file ${quoteArg(narrationPath)}`,
      `--offset ${result.nextOffset}`,
      `--limit ${options.limit}`,
      ...(options.pendingOnly ? [] : ["--all"]),
      ...toIncludeArgs(options),
    ].join(" ");
    console.log(`Next page: ${nextCommand}`);
  } else if (result.filteredPending > 0) {
    console.log("No more pages in this view, but pending chunks remain in scope.");
  } else {
    console.log("All chunks in this view are authored.");
  }
}

function runNarrationSetChunks(options: CliOptions): void {
  if (!options.payloadText) {
    throw new Error("narration-set-chunks requires --payload '<json>'.");
  }

  const payload = parseSetChunksPayload(options.payloadText);
  const plan = readReviewPlan(options.workspaceRoot);
  const narrationPath =
    options.narrationFilePath ?? toDefaultNarrationOutPath(options.workspaceRoot);
  const stepsPath = options.stepsFilePath ?? toDefaultStepsOutPath(options.workspaceRoot);
  const syncedNarration = readNarrationWithSync(options.workspaceRoot, plan, narrationPath);
  const steps = existsSync(stepsPath)
    ? readStepsTemplateFile(stepsPath)
    : createAiStoryStepsTemplate(plan);
  const updatedNarrationResult = applySetChunksToNarration(syncedNarration, payload, plan.chunks);
  const knownChunkIds = new Set(plan.chunks.map((chunk) => chunk.id));
  const updatedSteps = applySetChunksToSteps(steps, payload, knownChunkIds);
  if (updatedNarrationResult.updatedCount === 0) {
    throw new Error(
      "No chunk entries were updated. Check payload.ids against current review chunk IDs.",
    );
  }

  writePrettyJson(narrationPath, updatedNarrationResult.narration);
  writePrettyJson(stepsPath, updatedSteps);

  const progress = computeNarrationProgress(updatedNarrationResult.narration, plan.chunks);
  console.log(`Updated narration chunks: ${updatedNarrationResult.updatedCount}`);
  if (payload.level && payload.title && payload.why) {
    console.log(
      `Added story step for these chunk IDs with level=${payload.level}, title=${payload.title}.`,
    );
  }
  if (updatedNarrationResult.missingIds.length > 0) {
    console.log(`Ignored unknown chunk IDs: ${updatedNarrationResult.missingIds.join(", ")}`);
  }
  console.log(`Narration file updated: ${narrationPath}`);
  console.log(`Steps file updated: ${stepsPath}`);
  console.log(
    `Progress: ${progress.authored}/${progress.total} authored, ${progress.pending} remaining.`,
  );
  const listCommand = [
    "bun run apps/codex-review-vscode/src/cli.ts narration-list",
    `--workspace ${quoteArg(options.workspaceRoot)}`,
    `--narration-file ${quoteArg(narrationPath)}`,
    "--pending-only",
  ].join(" ");
  console.log(`List remaining chunks: ${listCommand}`);
  const applyCommand = [
    "bun run apps/codex-review-vscode/src/cli.ts apply-story",
    `--workspace ${quoteArg(options.workspaceRoot)}`,
    `--steps-file ${quoteArg(stepsPath)}`,
    `--narration-file ${quoteArg(narrationPath)}`,
  ].join(" ");
  console.log(`Apply to plan/tour: ${applyCommand}`);
}

function main(): void {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "generate") {
    runGenerate(options);
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
