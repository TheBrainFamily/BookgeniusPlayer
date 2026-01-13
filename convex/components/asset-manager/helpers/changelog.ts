/**
 * Changelog helper for real-time sync.
 * Records changes to folders and assets for FileProvider subscriptions.
 */
import type { MutationCtx } from "../_generated/server";

export type ChangeType =
  | "folder:create"
  | "folder:update"
  | "folder:delete"
  | "asset:create"
  | "asset:publish"
  | "asset:update"
  | "asset:archive"
  | "asset:delete"
  | "asset:move"
  | "asset:rename";

interface LogChangeOptions {
  basename?: string;
  oldFolderPath?: string;
  oldBasename?: string;
  performedBy?: string;
}

/**
 * Log a change to the changelog for real-time sync.
 *
 * @param ctx - Mutation context
 * @param changeType - Type of change (e.g., "folder:create", "asset:publish")
 * @param folderPath - The folder path affected by the change
 * @param options - Additional options (basename, old paths for moves/renames, actor)
 */
export async function logChange(
  ctx: MutationCtx,
  changeType: ChangeType,
  folderPath: string,
  options?: LogChangeOptions,
): Promise<void> {
  await ctx.db.insert("changelog", {
    changeType,
    folderPath,
    basename: options?.basename,
    oldFolderPath: options?.oldFolderPath,
    oldBasename: options?.oldBasename,
    performedBy: options?.performedBy,
    createdAt: Date.now(),
  });
}
