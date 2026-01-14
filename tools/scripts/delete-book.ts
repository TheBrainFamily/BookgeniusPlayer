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

const bookSlug = process.argv[2];

if (!bookSlug) {
  console.error("Usage: bun tools/scripts/delete-book.ts <book-slug>");
  console.error("Example: bun tools/scripts/delete-book.ts Lalka");
  process.exit(1);
}

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
  // Use wrapper script that injects admin identity
  return execSync(`./scripts/convex run ${command} '${argsJson}'`, {
    encoding: "utf-8",
    cwd: rootDir,
  });
}

async function confirm(message: string, expected: string): Promise<boolean> {
  if (process.env.NODE_ENV === "development") {
    return new Promise((resolve) => resolve(true));
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    return new Promise((resolve) => {
      rl.question(`${message}\n> `, (answer) => {
        rl.close();
        resolve(answer === expected);
      });
    });
  }
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
  console.log(`  DELETE BOOK: ${bookSlug}`);
  console.log("=========================================");
  console.log("");
  console.log("This will permanently delete:");
  console.log("  - All R2 storage files");
  console.log(
    "  - All Convex data (chapters, characters, backgrounds, music, notes, variants, cues)",
  );
  console.log("");

  const confirmed = await confirm(`Type the book slug exactly to confirm: ${bookSlug}`, bookSlug);
  if (!confirmed) {
    console.log("\nConfirmation failed. Aborting.");
    process.exit(1);
  }

  console.log("\nConfirmed. Starting deletion...\n");

  console.log("Step 1/3: Getting R2 keys from Convex...");
  let r2Keys: string[];
  try {
    const result = convexRun("reset:getBookR2Keys", { bookSlug });
    r2Keys = JSON.parse(result);
  } catch (err: unknown) {
    console.error("Failed to get R2 keys:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  console.log(`Found ${r2Keys.length} R2 keys.`);
  console.log("Done.\n");

  console.log("Step 2/3: Deleting from R2 storage...");
  console.log(`Bucket: ${R2_BUCKET}`);
  console.log(`Endpoint: ${endpoint}\n`);

  if (r2Keys.length > 0) {
    const { deleted, failed } = await deleteR2KeysBatch(r2Keys);
    console.log(`\nR2 deletion complete. Deleted: ${deleted}, Failed: ${failed}`);
    if (failed > 0) {
      console.error("\nERROR: Some R2 deletions failed. Aborting to prevent orphaned Convex data.");
      process.exit(1);
    }
  } else {
    console.log("No R2 keys to delete.");
  }
  console.log("Done.\n");

  console.log("Step 3/3: Deleting from Convex...");

  console.log("Deleting book metadata...");
  let hasMore = true;
  while (hasMore) {
    try {
      const result = convexRun("reset:deleteBookDataBatch", { bookSlug });
      const parsed = JSON.parse(result);
      console.log(result.trim());
      hasMore = parsed.hasMore;
    } catch (err) {
      console.error("Failed:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  console.log("\nDeleting book assets...");
  try {
    hasMore = true;
    while (hasMore) {
      const result = convexRun("reset:deleteBookAssetsBatch", { bookSlug });
      const parsed = JSON.parse(result);
      console.log(result.trim());
      hasMore = parsed.hasMore;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (errorMsg.includes("Too many reads")) {
      console.log("\nBook too large for bulk deletion. Switching to subfolder mode...");

      const subfolders = ["characters", "backgrounds", "music", "chapters"];
      for (const subfolder of subfolders) {
        console.log(`\nDeleting ${subfolder}...`);
        hasMore = true;
        while (hasMore) {
          const result = convexRun("reset:deleteBookAssetsBatch", { bookSlug, subfolder });
          const parsed = JSON.parse(result);
          console.log(result.trim());
          hasMore = parsed.hasMore;
        }
      }

      console.log("\nDeleting remaining book assets...");
      hasMore = true;
      while (hasMore) {
        const result = convexRun("reset:deleteBookAssetsBatch", { bookSlug });
        const parsed = JSON.parse(result);
        console.log(result.trim());
        hasMore = parsed.hasMore;
      }
    } else {
      console.error("Failed:", errorMsg);
      process.exit(1);
    }
  }
  console.log("Done.\n");

  console.log("=========================================");
  console.log(`  DELETION COMPLETE: ${bookSlug}`);
  console.log("=========================================");
}

main();
