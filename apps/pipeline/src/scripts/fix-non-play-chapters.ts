#!/usr/bin/env bun
import fs from "fs";
import os from "os";
import path from "path";
import { fixNonPlayCustomTags } from "../tools/fix-non-play-custom-tags";

type Args = { sourceRoot: string; outputRoot: string; slugs: string[] | null; dryRun: boolean };

const PLAY_SLUGS = new Set([
  "Hamlet",
  "Macbeth",
  "Midsummer-Nights-Dream",
  "Othello",
  "Romeo-And-Juliet",
  "The-Tempest",
  "Romeo-And-Juliet-Small",
  "Romeo-And-Juliet-Smaller",
]);

function resolvePath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", inputPath.slice(2));
  }
  return path.resolve(inputPath);
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  const outIdx = args.indexOf("--out");
  const slugsIdx = args.indexOf("--slugs");

  const repoRoot = path.resolve(process.cwd());
  const defaultSource = path.join(repoRoot, "ConvexAssets", "books");
  const defaultOut = path.join(os.tmpdir(), "bookgenius-fixed-nonplays");

  const slugs =
    slugsIdx !== -1 ? (args[slugsIdx + 1]?.split(",").map((s) => s.trim()) ?? []) : null;

  return {
    sourceRoot: resolvePath(sourceIdx !== -1 ? args[sourceIdx + 1] : defaultSource),
    outputRoot: resolvePath(outIdx !== -1 ? args[outIdx + 1] : defaultOut),
    slugs,
    dryRun: args.includes("--dry-run"),
  };
}

function listSlugs(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function listHtmlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith(".html"))
    .map((file) => path.join(dir, file));
}

async function main(): Promise<void> {
  const { sourceRoot, outputRoot, slugs, dryRun } = parseArgs();
  const targetSlugs = slugs ?? listSlugs(sourceRoot);

  let processedBooks = 0;
  let processedFiles = 0;
  let changedFiles = 0;

  for (const slug of targetSlugs) {
    if (PLAY_SLUGS.has(slug)) continue;

    const chaptersDir = path.join(sourceRoot, slug, "chapters-source");
    const files = listHtmlFiles(chaptersDir);
    if (files.length === 0) continue;

    processedBooks += 1;
    const outDir = path.join(outputRoot, slug, "chapters-source");
    if (!dryRun) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    for (const file of files) {
      const html = fs.readFileSync(file, "utf-8");
      const updated = fixNonPlayCustomTags(html);
      processedFiles += 1;
      if (updated !== html) {
        changedFiles += 1;
      }
      if (!dryRun) {
        const outPath = path.join(outDir, path.basename(file));
        fs.writeFileSync(outPath, updated, "utf-8");
      }
    }
  }

  console.log(
    `Done. Books: ${processedBooks}, Files: ${processedFiles}, Changed: ${changedFiles}. Output: ${outputRoot}`,
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
