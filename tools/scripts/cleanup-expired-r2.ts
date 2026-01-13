/**
 * Cleanup expired R2 deletions.
 *
 * This script processes pending R2 deletions that have passed their retention period
 * and deletes the actual files from R2 storage.
 *
 * Usage:
 *   bun tools/scripts/cleanup-expired-r2.ts              # Process expired deletions only
 *   bun tools/scripts/cleanup-expired-r2.ts --force-all  # Process ALL pending deletions (skip retention)
 *   bun tools/scripts/cleanup-expired-r2.ts --dry-run    # Show what would be deleted without deleting
 */

import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

const envPath = existsSync(join(rootDir, ".env"))
  ? join(rootDir, ".env")
  : join(rootDir, "backend/.env");

config({ path: envPath });

const forceAll = process.argv.includes("--force-all");
const dryRun = process.argv.includes("--dry-run");

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_ENDPOINT = process.env.R2_ENDPOINT;

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_ENDPOINT) {
  console.error("Missing R2 credentials in .env");
  console.error(`Loaded from: ${envPath}`);
  process.exit(1);
}

const endpoint = R2_ENDPOINT.startsWith("http") ? R2_ENDPOINT : `https://${R2_ENDPOINT}`;

const s3 = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

function convexRun(command: string, args: Record<string, unknown>): string {
  const argsJson = JSON.stringify(args);
  return execSync(`./scripts/convex run ${command} '${argsJson}'`, {
    encoding: "utf-8",
    cwd: rootDir,
  });
}

async function deleteR2KeysBatch(keys: string[]): Promise<{ deleted: number; failed: number }> {
  if (keys.length === 0) return { deleted: 0, failed: 0 };

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
    console.log(`R2 progress: ${Math.min(i + batchSize, keys.length)}/${keys.length}`);
  }

  return { deleted, failed };
}

async function main() {
  console.log("");
  console.log("=========================================");
  console.log("  CLEANUP EXPIRED R2 DELETIONS");
  console.log("=========================================");
  console.log("");

  if (dryRun) {
    console.log("DRY RUN MODE - No files will be deleted\n");
  }

  if (forceAll) {
    console.log("FORCE ALL MODE - Processing ALL pending deletions (ignoring retention period)\n");
  }

  let totalProcessed = 0;
  let totalR2Deleted = 0;
  let totalR2Failed = 0;
  let hasMore = true;

  while (hasMore) {
    console.log("Fetching pending deletions from Convex...");

    let result: { processed: number; r2KeysToDelete: string[]; hasMore: boolean };
    try {
      const output = convexRun("admin/r2Deletions:processExpiredR2Deletions", {
        batchSize: 100,
        forceAll,
      });
      result = JSON.parse(output);
    } catch (err: unknown) {
      console.error(
        "Failed to fetch pending deletions:",
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    }

    if (result.r2KeysToDelete.length === 0) {
      console.log("No pending deletions to process.");
      break;
    }

    console.log(`Found ${result.r2KeysToDelete.length} R2 keys to delete.`);

    if (dryRun) {
      console.log("\nKeys that would be deleted:");
      result.r2KeysToDelete.forEach((key) => console.log(`  - ${key}`));
      // In dry run, we already consumed the records from Convex, so we need to exit
      console.log("\nDRY RUN: Exiting without deleting from R2.");
      console.log("Note: The pending deletion records were already removed from Convex.");
      break;
    }

    console.log("\nDeleting from R2...");
    const { deleted, failed } = await deleteR2KeysBatch(result.r2KeysToDelete);

    totalProcessed += result.processed;
    totalR2Deleted += deleted;
    totalR2Failed += failed;
    hasMore = result.hasMore;

    if (hasMore) {
      console.log("More deletions pending, continuing...\n");
    }
  }

  console.log("");
  console.log("=========================================");
  console.log("  CLEANUP COMPLETE");
  console.log("=========================================");
  console.log(`  Records processed: ${totalProcessed}`);
  console.log(`  R2 files deleted:  ${totalR2Deleted}`);
  console.log(`  R2 files failed:   ${totalR2Failed}`);
  console.log("=========================================");
}

main();
