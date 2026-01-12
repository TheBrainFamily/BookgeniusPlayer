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
  _creationTime: number;
}

export interface ChangelogResponse {
  changes: ChangelogEntry[];
  nextCursor: number;
}

export interface SyncState {
  cursor: number;
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
