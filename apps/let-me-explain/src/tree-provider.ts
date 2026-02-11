import * as vscode from "vscode";

import { computeProgress } from "./core";
import type { ReviewChunk, ReviewPlan, ReviewState, ReviewStep } from "./core";

export type NodeKind = "section" | "summary" | "step" | "chunk" | "progress";

export interface SessionSnapshot {
  plan: ReviewPlan;
  state: ReviewState;
}

export class ReviewTreeItem extends vscode.TreeItem {
  public readonly kind: NodeKind;
  public readonly section?: string;
  public readonly stepId?: string;
  public readonly chunkId?: string;

  public constructor(
    kind: NodeKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    options: {
      description?: string;
      tooltip?: string;
      section?: string;
      stepId?: string;
      chunkId?: string;
      command?: vscode.Command;
      iconPath?: vscode.ThemeIcon;
      contextValue?: string;
    } = {},
  ) {
    super(label, collapsibleState);
    this.kind = kind;
    this.description = options.description;
    this.tooltip = options.tooltip;
    this.section = options.section;
    this.stepId = options.stepId;
    this.chunkId = options.chunkId;
    this.command = options.command;
    this.iconPath = options.iconPath;
    this.contextValue = options.contextValue;
  }
}

function statusLabel(status: string): string {
  if (status === "accept") {
    return "accepted";
  }
  if (status === "reject") {
    return "rejected";
  }
  return "unreviewed";
}

function iconForStatus(status: string): vscode.ThemeIcon {
  if (status === "accept") {
    return new vscode.ThemeIcon("check");
  }
  if (status === "reject") {
    return new vscode.ThemeIcon("close");
  }
  return new vscode.ThemeIcon("circle-outline");
}

function toChunkLine(chunk: ReviewChunk): number {
  return Math.max(1, chunk.newStart > 0 ? chunk.newStart : chunk.oldStart);
}

export class ReviewTreeProvider implements vscode.TreeDataProvider<ReviewTreeItem> {
  private readonly emitter: vscode.EventEmitter<ReviewTreeItem | undefined | null | void> =
    new vscode.EventEmitter<ReviewTreeItem | undefined | null | void>();

  private session: SessionSnapshot | undefined;

  public readonly onDidChangeTreeData: vscode.Event<ReviewTreeItem | undefined | null | void> =
    this.emitter.event;

  public setSession(session: SessionSnapshot | undefined): void {
    this.session = session;
    this.refresh();
  }

  public refresh(): void {
    this.emitter.fire();
  }

  public getTreeItem(element: ReviewTreeItem): vscode.TreeItem {
    return element;
  }

  private getSectionItems(): ReviewTreeItem[] {
    if (!this.session) {
      return [];
    }
    const progress = computeProgress(this.session.plan, this.session.state);
    return [
      new ReviewTreeItem("section", "Overview", vscode.TreeItemCollapsibleState.Expanded, {
        section: "overview",
      }),
      new ReviewTreeItem("section", "Steps", vscode.TreeItemCollapsibleState.Expanded, {
        section: "steps",
      }),
      new ReviewTreeItem("section", "Chunks", vscode.TreeItemCollapsibleState.Expanded, {
        section: "chunks",
      }),
      new ReviewTreeItem("section", "Progress", vscode.TreeItemCollapsibleState.Expanded, {
        section: "progress",
        description: `${progress.accepted}/${progress.total}`,
      }),
    ];
  }

  private getStepItems(steps: ReviewStep[]): ReviewTreeItem[] {
    return steps.map((step) => {
      const label = `${step.level.toUpperCase()} · ${step.title}`;
      return new ReviewTreeItem("step", label, vscode.TreeItemCollapsibleState.None, {
        stepId: step.id,
        tooltip: `${step.why}\nChunks: ${step.chunkIds.length}`,
        description: `${step.chunkIds.length} chunk(s)`,
        command: { command: "letMeExplain.openStep", title: "Open Step", arguments: [step.id] },
        contextValue: "step",
      });
    });
  }

  private getChunkItems(chunks: ReviewChunk[], state: ReviewState): ReviewTreeItem[] {
    return chunks.map((chunk) => {
      const status = state.chunkStatus[chunk.id] ?? "unreviewed";
      return new ReviewTreeItem(
        "chunk",
        `${chunk.filePath}:${toChunkLine(chunk)}`,
        vscode.TreeItemCollapsibleState.None,
        {
          chunkId: chunk.id,
          description: statusLabel(status),
          tooltip: `${chunk.preview}\n\n${chunk.narration}`,
          iconPath: iconForStatus(status),
          command: {
            command: "letMeExplain.openChunk",
            title: "Open Chunk",
            arguments: [chunk.id],
          },
          contextValue: "chunk",
        },
      );
    });
  }

  private getOverviewItems(plan: ReviewPlan): ReviewTreeItem[] {
    return [
      new ReviewTreeItem("summary", plan.summary.intent, vscode.TreeItemCollapsibleState.None, {
        description: `${plan.chunks.length} chunks`,
        tooltip: `Areas: ${plan.summary.areas.join(", ")}`,
        iconPath: new vscode.ThemeIcon("book"),
      }),
    ];
  }

  private getProgressItems(plan: ReviewPlan, state: ReviewState): ReviewTreeItem[] {
    const progress = computeProgress(plan, state);
    const completion = progress.complete ? "complete" : "in progress";
    return [
      new ReviewTreeItem(
        "progress",
        `Accepted: ${progress.accepted}`,
        vscode.TreeItemCollapsibleState.None,
      ),
      new ReviewTreeItem(
        "progress",
        `Rejected: ${progress.rejected}`,
        vscode.TreeItemCollapsibleState.None,
      ),
      new ReviewTreeItem(
        "progress",
        `Unreviewed: ${progress.unreviewed}`,
        vscode.TreeItemCollapsibleState.None,
      ),
      new ReviewTreeItem(
        "progress",
        `Status: ${completion}`,
        vscode.TreeItemCollapsibleState.None,
        {
          iconPath: progress.complete
            ? new vscode.ThemeIcon("pass")
            : new vscode.ThemeIcon("clock"),
        },
      ),
    ];
  }

  public async getChildren(element?: ReviewTreeItem): Promise<ReviewTreeItem[]> {
    if (!this.session) {
      return [];
    }

    if (!element) {
      return this.getSectionItems();
    }

    if (element.section === "overview") {
      return this.getOverviewItems(this.session.plan);
    }
    if (element.section === "steps") {
      return this.getStepItems(this.session.plan.steps);
    }
    if (element.section === "chunks") {
      return this.getChunkItems(this.session.plan.chunks, this.session.state);
    }
    if (element.section === "progress") {
      return this.getProgressItems(this.session.plan, this.session.state);
    }
    return [];
  }
}
