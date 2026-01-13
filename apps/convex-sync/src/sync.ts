/**
 * Main sync logic - initial sync, real-time updates, file management
 */

import { existsSync, mkdirSync, unlinkSync, rmdirSync } from "fs";
import { join, dirname } from "path";
import { ConvexClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { ConvexHttpClient } from "./client";
import { loadState, saveState } from "./config";
import type { Config, SyncState, ChangelogEntry, ConvexPublishedFile } from "./types";

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
    this.state = config.reset ? { cursor: 0 } : loadState(config.syncDir);
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
    if (this.state.cursor > 0 && !this.config.reset) {
      this.log(`📥 Resuming from cursor: ${this.state.cursor}`);
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
    const changelog = await this.httpClient.getChangelog(0, 1);
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
    const localPath = file.folderPath
      ? join(this.config.syncDir, file.folderPath, file.basename)
      : join(this.config.syncDir, file.basename);

    // Create parent directory
    mkdirSync(dirname(localPath), { recursive: true });

    // Check if we already have this version
    const existingVersion = await getVersionAttr(localPath);
    if (existingVersion === file.versionId) {
      return false; // Already have this version
    }

    this.debug(`📥 ${file.folderPath}/${file.basename} v${file.version}`);

    // Download
    const data = await this.httpClient.downloadFile(file.url);
    await Bun.write(localPath, data);

    // Store version in xattr
    await setVersionAttr(localPath, file.versionId);

    this.syncedFiles++;
    return true;
  }

  /** Catch up on changes since last sync */
  private async catchUpOnChanges(): Promise<void> {
    const response = await this.httpClient.getChangelog(this.state.cursor, 1000);

    if (response.changes.length === 0) {
      this.log("No changes since last run");
    } else {
      this.log(`📥 Catching up on ${response.changes.length} changes`);
      await this.processChanges(response.changes);
    }

    this.state.cursor = response.nextCursor;
    this.state.lastSync = new Date().toISOString();
    saveState(this.config.syncDir, this.state);
  }

  /** Subscribe to real-time changelog updates via WebSocket */
  private async subscribeToChanges(): Promise<void> {
    this.log("✅ Sync daemon running - watching for changes via WebSocket...");

    // Use Convex client's watchQuery for real-time WebSocket subscription
    this.unsubscribe = this.realtimeClient.onUpdate(
      api.cli.watchChangelog,
      { cursor: this.state.cursor, limit: 100, _adminKey: this.config.adminKey },
      async (response) => {
        if (response.changes.length > 0) {
          this.log(`📬 Received ${response.changes.length} changes`);
          await this.processChanges(response.changes);

          this.state.cursor = response.nextCursor;
          this.state.lastSync = new Date().toISOString();
          saveState(this.config.syncDir, this.state);
        }
      },
    );

    // Keep the process running
    while (this.isRunning) {
      await Bun.sleep(1000);
    }
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
      case "asset:update": {
        if (change.basename) {
          const file = await this.httpClient.getPublishedFile(change.folderPath, change.basename);
          if (file) {
            await this.downloadFile(file);
            this.log(`✅ Downloaded: ${change.folderPath}/${change.basename}`);
          }
        }
        break;
      }

      case "asset:archive": {
        if (change.basename) {
          this.deleteLocalFile(change.folderPath, change.basename);
        }
        break;
      }

      case "asset:move": {
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
        break;
      }

      case "asset:rename": {
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
        break;
      }

      case "folder:create": {
        const localPath = join(this.config.syncDir, change.folderPath);
        mkdirSync(localPath, { recursive: true });
        break;
      }

      case "folder:delete": {
        const localPath = join(this.config.syncDir, change.folderPath);
        try {
          rmdirSync(localPath, { recursive: true });
        } catch {
          // Ignore if doesn't exist
        }
        break;
      }

      default:
        this.debug(`Unknown change type: ${change.changeType}`);
    }
  }

  /** Delete a local file */
  private deleteLocalFile(folderPath: string, basename: string): void {
    const localPath = folderPath
      ? join(this.config.syncDir, folderPath, basename)
      : join(this.config.syncDir, basename);

    try {
      if (existsSync(localPath)) {
        unlinkSync(localPath);
        this.log(`🗑️ Deleted: ${folderPath}/${basename}`);
      }
    } catch {
      // Ignore
    }
  }
}
