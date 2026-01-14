/**
 * Main sync logic - initial sync, real-time updates, file management
 */

import { existsSync, mkdirSync, unlinkSync, rmSync } from "fs";
import { join, dirname, resolve } from "path";
import { ConvexClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { ConvexHttpClient } from "./client";
import { loadState, saveState } from "./config";
import type {
  Config,
  SyncState,
  ChangelogEntry,
  ConvexPublishedFile,
  CompoundCursor,
} from "./types";
import { INITIAL_CURSOR } from "./types";

const XATTR_KEY = "com.convex.versionId";

/** Get version from extended attribute (macOS/Linux) */
async function getVersionAttr(path: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["xattr", "-p", XATTR_KEY, path], { stdout: "pipe", stderr: "ignore" });
    const output = await new Response(proc.stdout).text();
    return output.trim() || null;
  } catch {
    return null;
  }
}

/** Set version in extended attribute */
async function setVersionAttr(path: string, version: string): Promise<void> {
  try {
    Bun.spawn(["xattr", "-w", XATTR_KEY, version, path], { stdout: "ignore", stderr: "ignore" });
  } catch {
    // Ignore xattr errors (e.g., on filesystems that don't support it)
  }
}

export class SyncDaemon {
  private config: Config;
  private httpClient: ConvexHttpClient;
  private realtimeClient: ConvexClient;
  private state: SyncState;
  private syncedFiles = 0;
  private isRunning = false;
  private unsubscribe?: () => void;

  constructor(config: Config) {
    this.config = config;
    this.httpClient = new ConvexHttpClient(config.convexUrl, config.adminKey);
    this.realtimeClient = new ConvexClient(config.convexUrl);
    this.state = config.reset ? { cursor: INITIAL_CURSOR } : loadState(config.syncDir);
  }

  private log(msg: string) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
  }

  private debug(msg: string) {
    if (this.config.verbose) {
      this.log(`[DEBUG] ${msg}`);
    }
  }

  /**
   * Validate that a path stays within syncDir to prevent path traversal attacks.
   * Returns the resolved safe path, or null if the path escapes syncDir.
   */
  private getSafePath(folderPath: string, basename: string): string | null {
    // Reject paths containing null bytes (common attack vector)
    if (folderPath.includes("\0") || basename.includes("\0")) {
      this.log(`❌ Path traversal blocked (null byte): ${folderPath}/${basename}`);
      return null;
    }

    // Reject absolute paths in components
    if (basename.startsWith("/") || (folderPath && folderPath.startsWith("/"))) {
      this.log(`❌ Path traversal blocked (absolute path): ${folderPath}/${basename}`);
      return null;
    }

    const localPath = folderPath
      ? join(this.config.syncDir, folderPath, basename)
      : join(this.config.syncDir, basename);

    const resolvedPath = resolve(localPath);
    const resolvedSyncDir = resolve(this.config.syncDir);

    // Ensure resolved path is within syncDir
    if (!resolvedPath.startsWith(resolvedSyncDir + "/") && resolvedPath !== resolvedSyncDir) {
      this.log(`❌ Path traversal blocked: ${folderPath}/${basename}`);
      return null;
    }

    return resolvedPath;
  }

  /**
   * Validate that a folder path stays within syncDir to prevent path traversal attacks.
   * Returns the resolved safe path, or null if the path escapes syncDir.
   */
  private getSafeFolderPath(folderPath: string): string | null {
    // Reject paths containing null bytes
    if (folderPath.includes("\0")) {
      this.log(`❌ Path traversal blocked (null byte): ${folderPath}`);
      return null;
    }

    // Reject absolute paths
    if (folderPath.startsWith("/")) {
      this.log(`❌ Path traversal blocked (absolute path): ${folderPath}`);
      return null;
    }

    const localPath = join(this.config.syncDir, folderPath);
    const resolvedPath = resolve(localPath);
    const resolvedSyncDir = resolve(this.config.syncDir);

    // Ensure resolved path is within syncDir
    if (!resolvedPath.startsWith(resolvedSyncDir + "/") && resolvedPath !== resolvedSyncDir) {
      this.log(`❌ Path traversal blocked: ${folderPath}`);
      return null;
    }

    return resolvedPath;
  }

  /** Start the sync daemon */
  async start(): Promise<void> {
    this.isRunning = true;
    this.log("🚀 Starting Convex Sync Daemon");
    this.log(`   Sync directory: ${this.config.syncDir}`);
    this.log(`   Convex URL: ${this.config.convexUrl}`);
    this.log(`   Concurrency: ${this.config.concurrency}`);

    // Create sync directory
    mkdirSync(this.config.syncDir, { recursive: true });

    // Initial sync or catch-up
    if (this.state.cursor.createdAt > 0 && !this.config.reset) {
      this.log(`📥 Resuming from cursor: ${this.state.cursor.createdAt}`);
      await this.catchUpOnChanges();
    } else {
      this.log("📥 Starting initial sync...");
      await this.performInitialSync();
    }

    // Subscribe to real-time changes
    this.log("📡 Subscribing to real-time changes...");
    await this.subscribeToChanges();
  }

  /** Stop the daemon */
  stop(): void {
    this.isRunning = false;
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.log("🛑 Sync daemon stopped");
  }

  /** Perform initial sync of all files */
  private async performInitialSync(): Promise<void> {
    this.syncedFiles = 0;

    // Get current cursor FIRST (so we don't miss changes during sync)
    const changelog = await this.httpClient.getChangelog(INITIAL_CURSOR, 1);
    const currentCursor = changelog.nextCursor;

    // Get all folders
    const folders = await this.httpClient.listAllFolders();
    this.log(`📁 Found ${folders.length} folders`);

    // List files in all folders (including root)
    const folderPaths = ["", ...folders.map((f) => f.path)];
    this.log(`📄 Listing files in ${folderPaths.length} folders...`);

    const allFiles = await this.listAllFilesParallel(folderPaths);
    this.log(`📄 Found ${allFiles.length} files to sync`);

    // Download files in parallel
    await this.downloadFilesParallel(allFiles);

    // Update state
    this.state.cursor = currentCursor;
    this.state.lastSync = new Date().toISOString();
    saveState(this.config.syncDir, this.state);

    this.log(`✅ Initial sync complete, ${this.syncedFiles} files downloaded`);
  }

  /** List files from multiple folders in parallel */
  private async listAllFilesParallel(folderPaths: string[]): Promise<ConvexPublishedFile[]> {
    const results = await Promise.allSettled(
      folderPaths.map((path) => this.httpClient.listPublishedFiles(path)),
    );

    const allFiles: ConvexPublishedFile[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allFiles.push(...result.value);
      } else {
        this.debug(`Failed to list folder: ${result.reason}`);
      }
    }
    return allFiles;
  }

  /** Download multiple files with concurrency limit */
  private async downloadFilesParallel(files: ConvexPublishedFile[]): Promise<void> {
    const { concurrency } = this.config;
    let failedCount = 0;

    // Process in batches
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const results = await Promise.allSettled(batch.map((file) => this.downloadFile(file)));

      for (const result of results) {
        if (result.status === "rejected") {
          failedCount++;
          this.debug(`Download failed: ${result.reason}`);
        }
      }

      // Progress update every 100 files
      if ((i + concurrency) % 100 < concurrency) {
        this.log(`   Progress: ${Math.min(i + concurrency, files.length)}/${files.length}`);
      }
    }

    if (failedCount > 0) {
      this.log(`⚠️ ${failedCount} files failed to download`);
    }
  }

  /** Download a single file */
  private async downloadFile(file: ConvexPublishedFile): Promise<boolean> {
    const safePath = this.getSafePath(file.folderPath ?? "", file.basename);
    if (!safePath) {
      return false; // Path validation failed, already logged
    }

    // Create parent directory
    mkdirSync(dirname(safePath), { recursive: true });

    // Check if we already have this version
    const existingVersion = await getVersionAttr(safePath);
    if (existingVersion === file.versionId) {
      return false; // Already have this version
    }

    this.debug(`📥 ${file.folderPath}/${file.basename} v${file.version}`);

    // Download
    const data = await this.httpClient.downloadFile(file.url);
    await Bun.write(safePath, data);

    // Store version in xattr
    await setVersionAttr(safePath, file.versionId);

    this.syncedFiles++;
    return true;
  }

  /** Catch up on changes since last sync */
  private async catchUpOnChanges(): Promise<void> {
    let totalProcessed = 0;
    let cursor = this.state.cursor;

    while (true) {
      const response = await this.httpClient.getChangelog(cursor, 1000);

      if (response.changes.length === 0) {
        break;
      }

      this.log(
        `📥 Processing ${response.changes.length} changes (total: ${totalProcessed + response.changes.length})`,
      );
      await this.processChanges(response.changes);
      totalProcessed += response.changes.length;

      // Check for cursor advancement to prevent infinite loops
      if (
        response.nextCursor.createdAt === cursor.createdAt &&
        response.nextCursor.id === cursor.id
      ) {
        break;
      }

      cursor = response.nextCursor;
      this.state.cursor = cursor;
      saveState(this.config.syncDir, this.state);
    }

    if (totalProcessed === 0) {
      this.log("No changes since last run");
    } else {
      this.log(`✅ Caught up on ${totalProcessed} changes`);
    }

    this.state.lastSync = new Date().toISOString();
    saveState(this.config.syncDir, this.state);
  }

  /** Subscribe to real-time changelog updates via WebSocket */
  private async subscribeToChanges(): Promise<void> {
    this.log("✅ Sync daemon running - watching for changes via WebSocket...");

    this.setupChangeSubscription(this.state.cursor);

    // Keep the process running
    while (this.isRunning) {
      await Bun.sleep(1000);
    }
  }

  /** Setup subscription with a specific cursor, resubscribing when cursor advances */
  private setupChangeSubscription(cursor: CompoundCursor): void {
    // Unsubscribe from previous subscription if exists
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    this.unsubscribe = this.realtimeClient.onUpdate(
      api.cli.watchChangelog,
      {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
        limit: 100,
        _adminKey: this.config.adminKey,
      },
      async (response) => {
        if (response.changes.length > 0) {
          this.log(`📬 Received ${response.changes.length} changes`);
          await this.processChanges(response.changes);

          this.state.cursor = response.nextCursor;
          this.state.lastSync = new Date().toISOString();
          saveState(this.config.syncDir, this.state);

          // Resubscribe with new cursor to advance pagination
          this.setupChangeSubscription(response.nextCursor);
        }
      },
    );
  }

  /** Process changelog entries */
  private async processChanges(changes: ChangelogEntry[]): Promise<void> {
    for (const change of changes) {
      this.debug(`📝 ${change.changeType}: ${change.folderPath}/${change.basename || ""}`);

      try {
        await this.processSingleChange(change);
      } catch (err) {
        this.log(`❌ Failed to process change: ${err}`);
      }
    }
  }

  /** Process a single changelog entry */
  private async processSingleChange(change: ChangelogEntry): Promise<void> {
    switch (change.changeType) {
      case "asset:publish":
      case "asset:create":
      case "asset:update":
        await this.handleAssetDownload(change);
        break;

      case "asset:archive":
        if (change.basename) {
          this.deleteLocalFile(change.folderPath, change.basename);
        }
        break;

      case "asset:move":
        await this.handleAssetMove(change);
        break;

      case "asset:rename":
        await this.handleAssetRename(change);
        break;

      case "folder:create":
        this.handleFolderCreate(change.folderPath);
        break;

      case "folder:delete":
        this.handleFolderDelete(change.folderPath);
        break;

      default:
        this.debug(`Unknown change type: ${change.changeType}`);
    }
  }

  /** Handle asset download (publish/create/update) */
  private async handleAssetDownload(change: ChangelogEntry): Promise<void> {
    if (!change.basename) return;
    const file = await this.httpClient.getPublishedFile(change.folderPath, change.basename);
    if (file) {
      await this.downloadFile(file);
      this.log(`✅ Downloaded: ${change.folderPath}/${change.basename}`);
    }
  }

  /** Handle asset move between folders */
  private async handleAssetMove(change: ChangelogEntry): Promise<void> {
    // Delete from old location
    if (change.oldFolderPath && change.basename) {
      this.deleteLocalFile(change.oldFolderPath, change.basename);
    }
    // Download at new location
    if (change.basename) {
      const file = await this.httpClient.getPublishedFile(change.folderPath, change.basename);
      if (file) {
        await this.downloadFile(file);
      }
    }
  }

  /** Handle asset rename */
  private async handleAssetRename(change: ChangelogEntry): Promise<void> {
    // Delete old name
    if (change.oldBasename) {
      this.deleteLocalFile(change.folderPath, change.oldBasename);
    }
    // Download with new name
    if (change.basename) {
      const file = await this.httpClient.getPublishedFile(change.folderPath, change.basename);
      if (file) {
        await this.downloadFile(file);
      }
    }
  }

  /** Handle folder creation with path validation */
  private handleFolderCreate(folderPath: string): void {
    const safePath = this.getSafeFolderPath(folderPath);
    if (safePath) {
      mkdirSync(safePath, { recursive: true });
    }
  }

  /** Handle folder deletion with path validation */
  private handleFolderDelete(folderPath: string): void {
    const safePath = this.getSafeFolderPath(folderPath);
    if (!safePath) return;

    try {
      rmSync(safePath, { recursive: true, force: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(`❌ Failed to delete folder ${folderPath}: ${message}`);
    }
  }

  /** Delete a local file */
  private deleteLocalFile(folderPath: string, basename: string): void {
    const safePath = this.getSafePath(folderPath, basename);
    if (!safePath) {
      return; // Path validation failed, already logged
    }

    try {
      if (existsSync(safePath)) {
        unlinkSync(safePath);
        this.log(`🗑️ Deleted: ${folderPath}/${basename}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(`❌ Failed to delete ${folderPath}/${basename}: ${message}`);
    }
  }
}
