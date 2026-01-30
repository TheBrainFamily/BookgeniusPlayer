import fs from "fs";
import path from "path";
import { convex } from "./convex-client";
import { AdminConvexHttpClient } from "../lib/AdminConvexHttpClient";
import { api } from "@bookgenius/convex/_generated/api";

const SKIP_BASENAMES = new Set([
  "openai-medium-044.mp4",
  "openai-medium-021.mp4",
  "openai-medium-033.mp4",
  "openai-medium-064.mp4",
]);

const DEFAULT_PREFIX = "attempt-fixed-";

type Args = {
  bookSlug: string;
  inputDir: string;
  only?: string;
  prefix: string;
  dryRun: boolean;
  allowNew: boolean;
  noSkip: boolean;
};

function resolvePath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", inputPath.slice(2));
  }
  return path.resolve(inputPath);
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: bun apps/pipeline/src/server/upload-background-videos.ts <book-slug> <input-dir> [--only <basename>] [--prefix <prefix>] [--dry-run] [--allow-new] [--no-skip]",
    );
    process.exit(1);
  }

  const bookSlug = args[0];
  const inputDir = resolvePath(args[1]);
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx !== -1 ? args[onlyIdx + 1] : undefined;
  const prefixIdx = args.indexOf("--prefix");
  const prefix = prefixIdx !== -1 ? args[prefixIdx + 1] : DEFAULT_PREFIX;

  return {
    bookSlug,
    inputDir,
    only,
    prefix,
    dryRun: args.includes("--dry-run"),
    allowNew: args.includes("--allow-new"),
    noSkip: args.includes("--no-skip"),
  };
}

function stripPrefix(filename: string, prefix: string): string {
  return filename.startsWith(prefix) ? filename.slice(prefix.length) : filename;
}

async function main() {
  const { bookSlug, inputDir, only, prefix, dryRun, allowNew, noSkip } = parseArgs();

  if (!fs.existsSync(inputDir)) {
    console.error(`Directory not found: ${inputDir}`);
    process.exit(1);
  }

  const folderPath = `books/${bookSlug}/backgrounds`;
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    console.error("Missing CONVEX_URL environment variable");
    process.exit(1);
  }
  const adminClient = new AdminConvexHttpClient(convexUrl);

  const files = fs.readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith(".mp4"));
  if (files.length === 0) {
    console.log("No .mp4 files found to upload.");
    return;
  }

  console.log(`Found ${files.length} .mp4 files in ${inputDir}`);
  if (dryRun) {
    console.log("Dry run enabled: no uploads will be performed.");
  }

  let uploaded = 0;
  let skipped = 0;
  let missing = 0;

  for (const sourceBasename of files) {
    const targetBasename = stripPrefix(sourceBasename, prefix);

    if (!noSkip && SKIP_BASENAMES.has(targetBasename)) {
      console.log(`Skipping (excluded): ${targetBasename}`);
      skipped += 1;
      continue;
    }

    if (only && targetBasename !== only && sourceBasename !== only) {
      skipped += 1;
      continue;
    }

    if (!allowNew) {
      const existing = await adminClient.query(api.cli.getAsset, {
        folderPath,
        basename: targetBasename,
      });
      if (!existing) {
        console.error(`Missing asset in Convex: ${folderPath}/${targetBasename}`);
        missing += 1;
        continue;
      }
    }

    const filePath = path.join(inputDir, sourceBasename);
    if (dryRun) {
      console.log(`[dry-run] Would upload ${filePath} -> ${folderPath}/${targetBasename}`);
      continue;
    }

    const content = fs.readFileSync(filePath);
    try {
      await convex.uploadFile({
        folderPath,
        basename: targetBasename,
        content,
        contentType: "video/mp4",
      });
      console.log(`Uploaded ${targetBasename}`);
      uploaded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to upload ${targetBasename}: ${message}`);
    }
  }

  console.log(
    `Done. Uploaded: ${uploaded}, skipped: ${skipped}, missing: ${missing}, total: ${files.length}`,
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
