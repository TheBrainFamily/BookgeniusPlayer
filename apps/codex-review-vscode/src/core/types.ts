export type ReviewLevel = "high" | "mid" | "low";

export type ChunkStatus = "unreviewed" | "accept" | "reject";

export interface ReviewSummary {
  intent: string;
  areas: string[];
}

export interface ReviewChunk {
  id: string;
  filePath: string;
  hunkIndex: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  patch: string;
  preview: string;
  explanation: string;
  reasoning: string;
}

export interface ReviewStep {
  id: string;
  level: ReviewLevel;
  title: string;
  why: string;
  files: string[];
  chunkIds: string[];
}

export interface ReviewPlan {
  version: number;
  sessionId: string;
  baseRef: string;
  source: "working_tree";
  createdAt: string;
  diffHash: string;
  summary: ReviewSummary;
  steps: ReviewStep[];
  chunks: ReviewChunk[];
}

export interface ReviewState {
  sessionId: string;
  chunkStatus: Record<string, ChunkStatus>;
  viewedChunkIds: string[];
  surfacedChunkIds: string[];
  lastOpenedChunkId?: string;
  updatedAt: string;
}

export interface ReviewProgress {
  total: number;
  accepted: number;
  rejected: number;
  unreviewed: number;
  complete: boolean;
}

export interface ReviewSessionLock {
  sessionId: string;
  baseRef: string;
  createdAt: string;
  diffHash: string;
  workspaceFingerprint: string;
}

export interface CodeTourStep {
  title: string;
  description: string;
  file: string;
  line: number;
}

export interface CodeTour {
  $schema: string;
  title: string;
  description: string;
  steps: CodeTourStep[];
}

export interface AuthorNotes {
  summary?: { intent?: string; areas?: string[] };
  stepOverrides?: Record<string, { title?: string; why?: string }>;
  chunkOverrides?: Record<string, { explanation?: string; reasoning?: string }>;
}
