/**
 * Types for Convex asset management
 */

export interface ConvexFolder {
  _id: string;
  path: string;
  name: string;
  parentPath?: string;
}

export interface ConvexPublishedFile {
  basename: string;
  folderPath: string;
  version: number;
  versionId: string;
  url: string;
  mimeType?: string;
  size?: number;
}

export interface ChangelogEntry {
  _id: string;
  changeType: string;
  folderPath: string;
  basename?: string;
  oldFolderPath?: string;
  oldBasename?: string;
  createdAt: number;
}

/** Compound cursor for reliable pagination (prevents skipping items with same timestamp) */
export interface CompoundCursor {
  createdAt: number;
  id: string;
}

/** Initial cursor for starting from the beginning */
export const INITIAL_CURSOR: CompoundCursor = { createdAt: 0, id: "" };

export interface ChangelogResponse {
  changes: ChangelogEntry[];
  nextCursor: CompoundCursor;
}

export interface SyncState {
  cursor: CompoundCursor;
  lastSync?: string;
}

export interface Config {
  convexUrl: string;
  adminKey?: string;
  syncDir: string;
  concurrency: number;
  reset: boolean;
  verbose: boolean;
}
