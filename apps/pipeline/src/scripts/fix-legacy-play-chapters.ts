#!/usr/bin/env bun
import fs from "fs";
import os from "os";
import path from "path";
import { fixLegacyPlayDidaskalia } from "../tools/fix-legacy-play-didaskalia";
import { fixLegacyPlayCustomTags } from "../tools/fix-legacy-play-custom-tags";
import { fixLegacyPlayStageDirections } from "../tools/fix-legacy-play-stage-directions";
import {
  applyMultiSpeakerMapToHtml,
  extractMultiSpeakerNextLineMapFromXml,
} from "../tools/fix-legacy-play-multi-speaker";

type Args = { bookSlug: string; sourceDir: string; outputDir: string; dryRun: boolean };

function resolvePath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", inputPath.slice(2));
  }
  return path.resolve(inputPath);
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(
      "Usage: bun apps/pipeline/src/scripts/fix-legacy-play-chapters.ts <book-slug> [--source <dir>] [--out <dir>] [--dry-run]",
    );
    process.exit(1);
  }

  const bookSlug = args[0];
  const sourceIdx = args.indexOf("--source");
  const outIdx = args.indexOf("--out");

  const repoRoot = path.resolve(process.cwd());
  const defaultSource = path.join(repoRoot, "ConvexAssets", "books", bookSlug, "chapters-source");
  const defaultOut = path.join(os.tmpdir(), "bookgenius-fixed-chapters", bookSlug);

  return {
    bookSlug,
    sourceDir: resolvePath(sourceIdx !== -1 ? args[sourceIdx + 1] : defaultSource),
    outputDir: resolvePath(outIdx !== -1 ? args[outIdx + 1] : defaultOut),
    dryRun: args.includes("--dry-run"),
  };
}

function isPlayBook(metadataXml: string): boolean {
  return /<Form>\s*Play\s*<\/Form>/i.test(metadataXml);
}

function getChapterNumberFromFilename(filename: string): number | null {
  const match = filename.match(/chapter-(\d+)\.html$/i);
  if (!match) return null;
  return parseInt(match[1], 10);
}

async function main(): Promise<void> {
  const { bookSlug, sourceDir, outputDir, dryRun } = parseArgs();
  const repoRoot = path.resolve(process.cwd());
  const booksContentDir = path.join(repoRoot, "books", bookSlug, "booksContent");
  const metadataPath = path.join(booksContentDir, "metadata.xml");

  if (!fs.existsSync(metadataPath)) {
    console.error(`Missing metadata.xml for ${bookSlug}: ${metadataPath}`);
    process.exit(1);
  }

  const metadataXml = fs.readFileSync(metadataPath, "utf-8");
  if (!isPlayBook(metadataXml)) {
    console.error(`Book ${bookSlug} is not marked as <Form>Play</Form>.`);
    process.exit(1);
  }

  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  const htmlFiles = fs
    .readdirSync(sourceDir)
    .filter((file) => file.toLowerCase().endsWith(".html"));

  if (htmlFiles.length === 0) {
    console.error(`No .html files found in ${sourceDir}`);
    process.exit(1);
  }

  if (!dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let changed = 0;
  let processed = 0;

  for (const file of htmlFiles) {
    const chapterNumber = getChapterNumberFromFilename(file);
    const sourcePath = path.join(sourceDir, file);
    const html = fs.readFileSync(sourcePath, "utf-8");

    let updated = fixLegacyPlayStageDirections(html);
    updated = fixLegacyPlayCustomTags(updated);
    updated = fixLegacyPlayDidaskalia(updated);

    if (chapterNumber !== null) {
      const xmlPath = path.join(booksContentDir, `chapter${chapterNumber}.xml`);
      if (fs.existsSync(xmlPath)) {
        const xml = fs.readFileSync(xmlPath, "utf-8");
        const map = extractMultiSpeakerNextLineMapFromXml(xml);
        updated = applyMultiSpeakerMapToHtml(updated, map);
      }
    }

    processed += 1;

    if (updated !== html) {
      changed += 1;
    }

    if (dryRun) {
      const note = updated !== html ? " (changed)" : "";
      console.log(`[dry-run] Would write ${file}${note}`);
    } else {
      const outPath = path.join(outputDir, file);
      fs.writeFileSync(outPath, updated, "utf-8");
    }
  }

  console.log(`Done. Processed ${processed} chapter(s). Changed ${changed}. Output: ${outputDir}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
