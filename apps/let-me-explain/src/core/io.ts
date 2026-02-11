import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  CodeTour,
  CodeTourStep,
  ReviewChunk,
  ReviewPlan,
  ReviewProgress,
  ReviewSessionLock,
  ReviewState,
} from "./types";

const REVIEW_FOLDER = ".let-me-explain";
const TOURS_FOLDER = ".tours";
const PLAN_FILE = "review-plan.json";
const STATE_FILE = "review-state.json";
const SESSION_LOCK_FILE = "session-lock.json";

function ensureDirExists(absolutePath: string): void {
  mkdirSync(absolutePath, { recursive: true });
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toPlanStepLine(chunk: ReviewChunk | undefined): number {
  if (!chunk) {
    return 1;
  }
  const line = chunk.newStart > 0 ? chunk.newStart : chunk.oldStart;
  return Math.max(1, line);
}

function toCodeTour(plan: ReviewPlan, authoredChunkIds?: Set<string>): CodeTour {
  const chunkMap = new Map(plan.chunks.map((chunk) => [chunk.id, chunk]));
  const steps: CodeTourStep[] = [];

  for (const step of plan.steps) {
    const resolvedChunks = step.chunkIds
      .map((id) => chunkMap.get(id))
      .filter((chunk): chunk is ReviewChunk => {
        if (!chunk) return false;
        if (authoredChunkIds && !authoredChunkIds.has(chunk.id)) return false;
        return true;
      });

    if (resolvedChunks.length === 0) continue;

    const isMulti = resolvedChunks.length > 1;
    resolvedChunks.forEach((chunk, index) => {
      const isFirst = index === 0;
      const suffix = isMulti ? ` (${index + 1}/${resolvedChunks.length})` : "";
      const title = `${step.level.toUpperCase()}: ${step.title}${suffix}`;
      const description = isFirst ? `${step.why}\n\n${chunk.narration}` : chunk.narration;
      steps.push({ title, description, file: chunk.filePath, line: toPlanStepLine(chunk) });
    });
  }

  return {
    $schema: "https://aka.ms/codetour-schema",
    title: `Let Me Explain ${plan.sessionId}`,
    description: plan.summary.intent,
    steps,
  };
}

export function getReviewPlanPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, REVIEW_FOLDER, PLAN_FILE);
}

export function getReviewStatePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, REVIEW_FOLDER, STATE_FILE);
}

export function getSessionLockPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, REVIEW_FOLDER, SESSION_LOCK_FILE);
}

export function getCodeTourPath(workspaceRoot: string, sessionId: string): string {
  return path.join(workspaceRoot, TOURS_FOLDER, `review-${sessionId}.tour`);
}

export function createInitialReviewState(plan: ReviewPlan): ReviewState {
  const chunkStatus: Record<string, "unreviewed"> = {};
  for (const chunk of plan.chunks) {
    chunkStatus[chunk.id] = "unreviewed";
  }

  return {
    sessionId: plan.sessionId,
    chunkStatus,
    viewedChunkIds: [],
    surfacedChunkIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export function writeReviewArtifacts(workspaceRoot: string, plan: ReviewPlan): void {
  const reviewDir = path.join(workspaceRoot, REVIEW_FOLDER);
  const toursDir = path.join(workspaceRoot, TOURS_FOLDER);
  ensureDirExists(reviewDir);
  ensureDirExists(toursDir);

  const planPath = getReviewPlanPath(workspaceRoot);
  const statePath = getReviewStatePath(workspaceRoot);
  const tourPath = getCodeTourPath(workspaceRoot, plan.sessionId);
  const state = createInitialReviewState(plan);
  const tour = toCodeTour(plan, new Set());

  writeFileSync(planPath, prettyJson(plan), "utf8");
  writeFileSync(statePath, prettyJson(state), "utf8");
  writeFileSync(tourPath, prettyJson(tour), "utf8");
}

export function writeReviewPlanAndTour(
  workspaceRoot: string,
  plan: ReviewPlan,
  authoredChunkIds?: Set<string>,
): void {
  const reviewDir = path.join(workspaceRoot, REVIEW_FOLDER);
  const toursDir = path.join(workspaceRoot, TOURS_FOLDER);
  ensureDirExists(reviewDir);
  ensureDirExists(toursDir);

  const planPath = getReviewPlanPath(workspaceRoot);
  const tourPath = getCodeTourPath(workspaceRoot, plan.sessionId);
  const tour = toCodeTour(plan, authoredChunkIds);

  writeFileSync(planPath, prettyJson(plan), "utf8");
  writeFileSync(tourPath, prettyJson(tour), "utf8");
}

export function readReviewPlan(workspaceRoot: string): ReviewPlan {
  const raw = readFileSync(getReviewPlanPath(workspaceRoot), "utf8");
  return JSON.parse(raw) as ReviewPlan;
}

export function readReviewState(workspaceRoot: string): ReviewState {
  const raw = readFileSync(getReviewStatePath(workspaceRoot), "utf8");
  return JSON.parse(raw) as ReviewState;
}

export function writeReviewState(workspaceRoot: string, state: ReviewState): void {
  const reviewDir = path.join(workspaceRoot, REVIEW_FOLDER);
  ensureDirExists(reviewDir);
  writeFileSync(getReviewStatePath(workspaceRoot), prettyJson(state), "utf8");
}

export function readSessionLock(workspaceRoot: string): ReviewSessionLock {
  const raw = readFileSync(getSessionLockPath(workspaceRoot), "utf8");
  return JSON.parse(raw) as ReviewSessionLock;
}

export function writeSessionLock(workspaceRoot: string, lock: ReviewSessionLock): void {
  const reviewDir = path.join(workspaceRoot, REVIEW_FOLDER);
  ensureDirExists(reviewDir);
  writeFileSync(getSessionLockPath(workspaceRoot), prettyJson(lock), "utf8");
}

export function ensureStateMatchesPlan(
  workspaceRoot: string,
  plan: ReviewPlan,
  existingState: ReviewState | undefined,
): ReviewState {
  if (!existingState || existingState.sessionId !== plan.sessionId) {
    const next = createInitialReviewState(plan);
    writeReviewState(workspaceRoot, next);
    return next;
  }

  const nextChunkStatus = { ...existingState.chunkStatus };
  for (const chunk of plan.chunks) {
    if (!nextChunkStatus[chunk.id]) {
      nextChunkStatus[chunk.id] = "unreviewed";
    }
  }

  const knownChunkIds = new Set(plan.chunks.map((chunk) => chunk.id));
  const viewedChunkIds = Array.from(
    new Set((existingState.viewedChunkIds ?? []).filter((chunkId) => knownChunkIds.has(chunkId))),
  );
  const surfacedChunkIds = Array.from(
    new Set((existingState.surfacedChunkIds ?? []).filter((chunkId) => knownChunkIds.has(chunkId))),
  );
  const lastOpenedChunkId =
    existingState.lastOpenedChunkId && knownChunkIds.has(existingState.lastOpenedChunkId)
      ? existingState.lastOpenedChunkId
      : undefined;

  const nextState: ReviewState = {
    ...existingState,
    chunkStatus: nextChunkStatus,
    viewedChunkIds,
    surfacedChunkIds,
    lastOpenedChunkId,
    updatedAt: existingState.updatedAt || new Date().toISOString(),
  };
  writeReviewState(workspaceRoot, nextState);
  return nextState;
}

export function computeProgress(plan: ReviewPlan, state: ReviewState): ReviewProgress {
  let accepted = 0;
  let rejected = 0;
  let unreviewed = 0;

  for (const chunk of plan.chunks) {
    const status = state.chunkStatus[chunk.id] ?? "unreviewed";
    if (status === "accept") {
      accepted += 1;
      continue;
    }
    if (status === "reject") {
      rejected += 1;
      continue;
    }
    unreviewed += 1;
  }

  return { total: plan.chunks.length, accepted, rejected, unreviewed, complete: unreviewed === 0 };
}
