import * as path from "node:path";
import * as vscode from "vscode";

import {
  buildReviewPlan,
  computeChunksFingerprint,
  computeProgress,
  ensureStateMatchesPlan,
  getReviewPlanPath,
  parsePatchToChunks,
  readReviewPlan,
  readReviewState,
  writeReviewArtifacts,
  writeReviewState,
  getWorkingTreePatch,
  createUntrackedChunks,
} from "./core";
import type { ReviewChunk, ReviewPlan, ReviewState } from "./core";
import { ReviewTreeProvider } from "./tree-provider";

interface LoadedSession {
  workspaceRoot: string;
  plan: ReviewPlan;
  state: ReviewState;
  chunkById: Map<string, ReviewChunk>;
  stepById: Map<string, ReviewPlan["steps"][number]>;
}

let provider: ReviewTreeProvider | undefined;
let treeView: vscode.TreeView<unknown> | undefined;
let session: LoadedSession | undefined;
let activeChunkId: string | undefined;

function getWorkspaceRoot(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath;
}

function toChunkLine(chunk: ReviewChunk): number {
  return Math.max(1, chunk.newStart > 0 ? chunk.newStart : chunk.oldStart);
}

function toChunkRange(doc: vscode.TextDocument, chunk: ReviewChunk): vscode.Range {
  const startLine = Math.max(0, toChunkLine(chunk) - 1);
  const chunkLength = Math.max(chunk.newLines, 1);
  const endLine = Math.min(doc.lineCount - 1, startLine + chunkLength - 1);
  return new vscode.Range(startLine, 0, endLine, 0);
}

function findUnreviewedChunk(current: LoadedSession): ReviewChunk | undefined {
  return current.plan.chunks.find(
    (chunk) => (current.state.chunkStatus[chunk.id] ?? "unreviewed") === "unreviewed",
  );
}

function getChunkById(current: LoadedSession, chunkId: string): ReviewChunk | undefined {
  return current.chunkById.get(chunkId);
}

function getStepById(
  current: LoadedSession,
  stepId: string,
): ReviewPlan["steps"][number] | undefined {
  return current.stepById.get(stepId);
}

function computeCurrentDiffHash(workspaceRoot: string, baseRef: string): string {
  const patch = getWorkingTreePatch(workspaceRoot, baseRef);
  const parsed = parsePatchToChunks(patch);
  const chunks = [...parsed.chunks, ...createUntrackedChunks(workspaceRoot)];
  return computeChunksFingerprint(chunks);
}

function mapSession(workspaceRoot: string, plan: ReviewPlan, state: ReviewState): LoadedSession {
  return {
    workspaceRoot,
    plan,
    state,
    chunkById: new Map(plan.chunks.map((chunk) => [chunk.id, chunk])),
    stepById: new Map(plan.steps.map((step) => [step.id, step])),
  };
}

async function loadSession(workspaceRoot: string): Promise<LoadedSession> {
  const plan = readReviewPlan(workspaceRoot);
  let existingState: ReviewState | undefined;
  try {
    existingState = readReviewState(workspaceRoot);
  } catch {
    existingState = undefined;
  }
  const state = ensureStateMatchesPlan(workspaceRoot, plan, existingState);
  const current = mapSession(workspaceRoot, plan, state);
  const currentHash = computeCurrentDiffHash(workspaceRoot, plan.baseRef);
  if (currentHash !== plan.diffHash) {
    await vscode.window.showWarningMessage(
      "Working tree changed since this session was generated. Consider regenerating.",
    );
  }
  return current;
}

async function openChunk(current: LoadedSession, chunkId: string): Promise<void> {
  const chunk = getChunkById(current, chunkId);
  if (!chunk) {
    await vscode.window.showErrorMessage(`Chunk not found: ${chunkId}`);
    return;
  }

  activeChunkId = chunk.id;
  const viewed = new Set(current.state.viewedChunkIds ?? []);
  viewed.add(chunk.id);
  current.state.viewedChunkIds = Array.from(viewed);
  current.state.lastOpenedChunkId = chunk.id;
  current.state.updatedAt = new Date().toISOString();
  writeReviewState(current.workspaceRoot, current.state);
  provider?.setSession({ plan: current.plan, state: current.state });

  const absolutePath = path.join(current.workspaceRoot, chunk.filePath);
  const uri = vscode.Uri.file(absolutePath);
  await vscode.commands.executeCommand("git.openChange", uri);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  const range = toChunkRange(doc, chunk);
  editor.selection = new vscode.Selection(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  );
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

async function setChunkStatus(
  current: LoadedSession,
  chunkId: string | undefined,
  status: "accept" | "reject",
): Promise<void> {
  if (!chunkId) {
    await vscode.window.showWarningMessage("No chunk selected yet.");
    return;
  }

  if (!current.chunkById.has(chunkId)) {
    await vscode.window.showErrorMessage(`Chunk not found: ${chunkId}`);
    return;
  }

  current.state.chunkStatus[chunkId] = status;
  const viewed = new Set(current.state.viewedChunkIds ?? []);
  viewed.add(chunkId);
  current.state.viewedChunkIds = Array.from(viewed);
  current.state.lastOpenedChunkId = chunkId;
  current.state.updatedAt = new Date().toISOString();
  writeReviewState(current.workspaceRoot, current.state);
  provider?.setSession({ plan: current.plan, state: current.state });
}

async function ensureSessionLoaded(): Promise<LoadedSession | undefined> {
  if (session) {
    return session;
  }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    await vscode.window.showErrorMessage("Open a workspace folder first.");
    return undefined;
  }

  try {
    session = await loadSession(workspaceRoot);
    provider?.setSession({ plan: session.plan, state: session.state });
    return session;
  } catch {
    const planPath = getReviewPlanPath(workspaceRoot);
    await vscode.window.showWarningMessage(
      `No review session loaded. Generate one first (${planPath}).`,
    );
    return undefined;
  }
}

async function generateAndLoadSession(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    await vscode.window.showErrorMessage("Open a workspace folder first.");
    return;
  }

  try {
    const plan = buildReviewPlan({ workspaceRoot, baseRef: "HEAD" });
    writeReviewArtifacts(workspaceRoot, plan);
    session = await loadSession(workspaceRoot);
    provider?.setSession({ plan: session.plan, state: session.state });
    await vscode.window.showInformationMessage(
      `Generated session ${plan.sessionId} with ${plan.chunks.length} chunks.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate review session.";
    await vscode.window.showErrorMessage(message);
  }
}

function resolveChunkId(arg: unknown): string | undefined {
  if (typeof arg === "string" && arg.length > 0) {
    return arg;
  }
  if (typeof arg === "object" && arg !== null && "chunkId" in arg) {
    const value = (arg as { chunkId?: unknown }).chunkId;
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return activeChunkId;
}

function resolveStepId(arg: unknown): string | undefined {
  if (typeof arg === "string" && arg.length > 0) {
    return arg;
  }
  if (typeof arg === "object" && arg !== null && "stepId" in arg) {
    const value = (arg as { stepId?: unknown }).stepId;
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  provider = new ReviewTreeProvider();
  treeView = vscode.window.createTreeView("codexReviewView", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.commands.registerCommand("codexReview.generateSession", async () => {
      await generateAndLoadSession();
    }),
    vscode.commands.registerCommand("codexReview.loadSession", async () => {
      const loaded = await ensureSessionLoaded();
      if (!loaded) {
        return;
      }
      await vscode.window.showInformationMessage(
        `Loaded session ${loaded.plan.sessionId} (${loaded.plan.chunks.length} chunks).`,
      );
    }),
    vscode.commands.registerCommand("codexReview.openStep", async (arg: unknown) => {
      const loaded = await ensureSessionLoaded();
      if (!loaded) {
        return;
      }
      const stepId = resolveStepId(arg);
      if (!stepId) {
        await vscode.window.showWarningMessage("Step id not provided.");
        return;
      }
      const step = getStepById(loaded, stepId);
      if (!step) {
        await vscode.window.showErrorMessage(`Step not found: ${stepId}`);
        return;
      }
      const chunkId = step.chunkIds[0];
      if (!chunkId) {
        await vscode.window.showWarningMessage(`Step has no chunk anchors: ${step.title}`);
        return;
      }
      await openChunk(loaded, chunkId);
    }),
    vscode.commands.registerCommand("codexReview.openChunk", async (arg: unknown) => {
      const loaded = await ensureSessionLoaded();
      if (!loaded) {
        return;
      }
      const chunkId = resolveChunkId(arg);
      if (!chunkId) {
        await vscode.window.showWarningMessage("Chunk id not provided.");
        return;
      }
      await openChunk(loaded, chunkId);
    }),
    vscode.commands.registerCommand("codexReview.acceptChunk", async (arg: unknown) => {
      const loaded = await ensureSessionLoaded();
      if (!loaded) {
        return;
      }
      await setChunkStatus(loaded, resolveChunkId(arg), "accept");
    }),
    vscode.commands.registerCommand("codexReview.rejectChunk", async (arg: unknown) => {
      const loaded = await ensureSessionLoaded();
      if (!loaded) {
        return;
      }
      await setChunkStatus(loaded, resolveChunkId(arg), "reject");
    }),
    vscode.commands.registerCommand("codexReview.nextUnreviewed", async () => {
      const loaded = await ensureSessionLoaded();
      if (!loaded) {
        return;
      }
      const next = findUnreviewedChunk(loaded);
      if (!next) {
        await vscode.window.showInformationMessage("All chunks are labeled accept/reject.");
        return;
      }
      await openChunk(loaded, next.id);
    }),
    vscode.commands.registerCommand("codexReview.showProgress", async () => {
      const loaded = await ensureSessionLoaded();
      if (!loaded) {
        return;
      }
      const progress = computeProgress(loaded.plan, loaded.state);
      await vscode.window.showInformationMessage(
        `Accepted: ${progress.accepted}, Rejected: ${progress.rejected}, Unreviewed: ${progress.unreviewed}`,
      );
    }),
    vscode.commands.registerCommand("codexReview.completeReview", async () => {
      const loaded = await ensureSessionLoaded();
      if (!loaded) {
        return;
      }
      const progress = computeProgress(loaded.plan, loaded.state);
      if (!progress.complete) {
        await vscode.window.showWarningMessage(
          `Cannot complete review. ${progress.unreviewed} chunk(s) still unreviewed.`,
        );
        return;
      }
      await vscode.window.showInformationMessage("Review complete. All chunks have accept/reject.");
    }),
  );
}

export function deactivate(): void {
  session = undefined;
  activeChunkId = undefined;
}
