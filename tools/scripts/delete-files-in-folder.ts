/**
 * Delete all files in a specific folder.
 *
 * This script deletes all files (assets and their versions) in a folder from Convex.
 * R2 files are queued for deferred deletion (30-day retention period).
 *
 * To immediately delete from R2 after running this script, use:
 *   bun tools/scripts/cleanup-expired-r2.ts --force-all
 *
 * Usage:
 *   bun tools/scripts/delete-files-in-folder.ts "books/john-milton_paradise-lost/characters"
 *   bun tools/scripts/delete-files-in-folder.ts "books/my-book/backgrounds" --immediate  # Also delete from R2 immediately
 */

import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as readline from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

const envPath = existsSync(join(rootDir, ".env"))
  ? join(rootDir, ".env")
  : join(rootDir, "backend/.env");

config({ path: envPath });

const folderPath = process.argv[2];
const immediate = process.argv.includes("--immediate");

if (!folderPath) {
  console.error("Usage: bun tools/scripts/delete-files-in-folder.ts <folder-path> [--immediate]");
  console.error('Example: bun tools/scripts/delete-files-in-folder.ts "books/my-book/characters"');
  process.exit(1);
}

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_ENDPOINT = process.env.R2_ENDPOINT;

if (immediate && (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_ENDPOINT)) {
  console.error("Missing R2 credentials in .env (required for --immediate mode)");
  console.error(`Loaded from: ${envPath}`);
  process.exit(1);
}

const endpoint = R2_ENDPOINT?.startsWith("http") ? R2_ENDPOINT : `https://${R2_ENDPOINT}`;

const s3 = immediate
  ? new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
    })
  : null;

function convexRun(command: string, args: Record<string, unknown>): string {
  const argsJson = JSON.stringify(args);
  return execSync(`./scripts/convex run ${command} '${argsJson}'`, {
    encoding: "utf-8",
    cwd: rootDir,
  });
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function deleteR2KeysBatch(keys: string[]): Promise<{ deleted: number; failed: number }> {
  if (!s3 || keys.length === 0) return { deleted: 0, failed: 0 };

  const batchSize = 1000;
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    try {
      const result = await s3.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: true },
        }),
      );
      const errors = result.Errors?.length ?? 0;
      deleted += batch.length - errors;
      failed += errors;
      if (errors > 0) {
        console.error(`Batch ${i / batchSize + 1}: ${errors} failures`);
        result.Errors?.forEach((e) => console.error(`  ${e.Key}: ${e.Message}`));
      }
    } catch (err: unknown) {
      console.error(
        `Batch ${i / batchSize + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      failed += batch.length;
    }
  }

  return { deleted, failed };
}

async function main() {
  console.log("");
  console.log("=========================================");
  console.log(`  DELETE FILES IN FOLDER`);
  console.log(`  ${folderPath}`);
  console.log("=========================================");
  console.log("");

  // First, list files that will be deleted
  console.log("Fetching files in folder...");
  let files: { basename: string; folderPath: string; r2Key?: string }[];
  try {
    const output = convexRun("cli:listPublishedFilesInFolder", { folderPath });
    files = JSON.parse(output);
  } catch (err: unknown) {
    console.error("Failed to list files:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (files.length === 0) {
    console.log("No files found in folder.");
    process.exit(0);
  }

  console.log(`Found ${files.length} files:`);
  files.forEach((f) => console.log(`  - ${f.basename}`));
  console.log("");

  if (immediate) {
    console.log("IMMEDIATE MODE: R2 files will be deleted immediately (no 30-day retention).");
  } else {
    console.log("R2 files will be queued for deletion with 30-day retention period.");
    console.log("To delete from R2 immediately after, run:");
    console.log("  bun tools/scripts/cleanup-expired-r2.ts --force-all");
  }
  console.log("");

  const confirmed = await confirm("Proceed with deletion?");
  if (!confirmed) {
    console.log("\nAborted.");
    process.exit(0);
  }

  console.log("\nDeleting from Convex...");
  let result: { deletedAssets: number; deletedVersions: number };
  try {
    const output = convexRun("admin/deleteFilesInFolder:deleteFilesInFolder", { folderPath });
    result = JSON.parse(output);
  } catch (err: unknown) {
    console.error("Failed to delete:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`Deleted ${result.deletedAssets} assets, ${result.deletedVersions} versions.`);

  if (immediate) {
    console.log("\nProcessing immediate R2 deletion...");
    let totalR2Deleted = 0;
    let totalR2Failed = 0;
    let hasMore = true;

    while (hasMore) {
      let processResult: { processed: number; r2KeysToDelete: string[]; hasMore: boolean };
      try {
        const output = convexRun("admin/r2Deletions:processExpiredR2Deletions", {
          batchSize: 100,
          forceAll: true,
        });
        processResult = JSON.parse(output);
      } catch (err: unknown) {
        console.error(
          "Failed to process R2 deletions:",
          err instanceof Error ? err.message : String(err),
        );
        break;
      }

      if (processResult.r2KeysToDelete.length === 0) {
        break;
      }

      const { deleted, failed } = await deleteR2KeysBatch(processResult.r2KeysToDelete);
      totalR2Deleted += deleted;
      totalR2Failed += failed;
      hasMore = processResult.hasMore;
    }

    console.log(`R2 deletion complete. Deleted: ${totalR2Deleted}, Failed: ${totalR2Failed}`);
  }

  console.log("");
  console.log("=========================================");
  console.log("  DELETION COMPLETE");
  console.log("=========================================");
}

main();
