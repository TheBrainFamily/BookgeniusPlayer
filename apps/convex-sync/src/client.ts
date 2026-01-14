/**
 * Convex HTTP client for asset management queries
 */

import type { ConvexFolder, ConvexPublishedFile, ChangelogResponse, CompoundCursor } from "./types";

export class ConvexHttpClient {
  private convexUrl: string;
  private adminKey?: string;

  constructor(convexUrl: string, adminKey?: string) {
    this.convexUrl = convexUrl.replace(/\/$/, "");
    this.adminKey = adminKey;
  }

  /**
   * Execute a Convex query via HTTP API
   */
  private async query<T>(functionPath: string, args: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.convexUrl}/api/query`;

    const argsWithAdmin = this.adminKey ? { ...args, _adminKey: this.adminKey } : args;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: functionPath, args: argsWithAdmin }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    const result = (await response.json()) as { value?: T; errorMessage?: string };

    if (result.errorMessage) {
      throw new Error(`Convex error: ${result.errorMessage}`);
    }

    return result.value as T;
  }

  /** List all folders in one efficient query */
  async listAllFolders(): Promise<ConvexFolder[]> {
    return this.query<ConvexFolder[]>("cli:listAllFolders");
  }

  /** List published files in a folder */
  async listPublishedFiles(folderPath: string): Promise<ConvexPublishedFile[]> {
    return this.query<ConvexPublishedFile[]>("cli:listPublishedFilesInFolder", { folderPath });
  }

  /** Get a single published file */
  async getPublishedFile(
    folderPath: string,
    basename: string,
  ): Promise<ConvexPublishedFile | null> {
    const files = await this.listPublishedFiles(folderPath);
    return files.find((f) => f.basename === basename) ?? null;
  }

  /** Get changelog entries since a cursor (flat args for backend compatibility) */
  async getChangelog(cursor: CompoundCursor, limit = 100): Promise<ChangelogResponse> {
    return this.query<ChangelogResponse>("cli:watchChangelog", {
      cursorCreatedAt: cursor.createdAt,
      cursorId: cursor.id,
      limit,
    });
  }

  /** Download file content from URL */
  async downloadFile(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url, {
      headers: this.adminKey ? { Authorization: `Convex ${this.adminKey}` } : {},
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    return response.arrayBuffer();
  }
}
