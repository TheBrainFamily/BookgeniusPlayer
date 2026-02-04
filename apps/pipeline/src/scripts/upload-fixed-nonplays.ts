#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { convex } from "../server/convex-client";
import { AdminConvexHttpClient } from "../lib/AdminConvexHttpClient";
import { api } from "@bookgenius/convex/_generated/api";
import { getChapterTitle } from "src/tools/new-tooling/get-chapter-title";
import { DOMParser, type Element as XMLElement } from "@xmldom/xmldom";
import { computeParagraphCount } from "../lib/paragraphCount";
import { mapFilenameToBasename } from "./upload-chapters-source";

type Args = { sourceRoot: string; slugs: string[] | null; dryRun: boolean; allowNew: boolean };

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
  const slugsIdx = args.indexOf("--slugs");

  const defaultSource = path.join(process.env.TMPDIR ?? "/tmp", "bookgenius-fixed-nonplays");

  const slugs =
    slugsIdx !== -1 ? (args[slugsIdx + 1]?.split(",").map((s) => s.trim()) ?? []) : null;

  return {
    sourceRoot: resolvePath(sourceIdx !== -1 ? args[sourceIdx + 1] : defaultSource),
    slugs,
    dryRun: args.includes("--dry-run"),
    allowNew: args.includes("--allow-new"),
  };
}

function listSlugs(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function listHtmlFiles(inputDir: string): string[] {
  const htmlFiles = fs.readdirSync(inputDir).filter((file) => file.toLowerCase().endsWith(".html"));
  if (htmlFiles.length >= 1) {
    return htmlFiles;
  }
  console.error(`No .html files found in ${inputDir}`);
  process.exit(1);
}

function detectContentType(filePath: string): string {
  return filePath.toLowerCase().endsWith(".html") ? "text/html" : "application/octet-stream";
}

function parseChapterIntoDom(chapter: string): XMLElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(chapter, "text/html");
  const root = doc.documentElement as XMLElement;
  return root;
}

async function uploadSlug(
  slug: string,
  inputDir: string,
  adminClient: AdminConvexHttpClient,
  dryRun: boolean,
  allowNew: boolean,
): Promise<{ uploaded: number; skipped: number; missing: number; total: number }> {
  const folderPath = `books/${slug}/chapters-source`;
  const stats = { uploaded: 0, skipped: 0, missing: 0, total: 0 };

  const files = listHtmlFiles(inputDir).map((file) => ({
    source: path.join(inputDir, file),
    basename: mapFilenameToBasename(file),
  }));

  for (const file of files) {
    stats.total += 1;

    if (!allowNew) {
      const existing = await adminClient.query(api.cli.getAsset, {
        folderPath,
        basename: file.basename,
      });
      if (!existing) {
        console.error(`Missing asset in Convex: ${folderPath}/${file.basename}`);
        stats.missing += 1;
        continue;
      }
    }

    if (dryRun) {
      console.log(`[dry-run] Would upload ${file.source} -> ${folderPath}/${file.basename}`);
      stats.skipped += 1;
      continue;
    }

    const content = fs.readFileSync(file.source);
    const paragraphCount = computeParagraphCount(content.toString("utf-8"));
    try {
      await convex.uploadFile({
        folderPath,
        basename: file.basename,
        content,
        contentType: detectContentType(file.source),
      });
      const bookPath = `books/${slug}`;
      await convex.updateChapterMetadata({
        bookPath,
        folderPath: `${bookPath}/chapters-source`,
        basename: file.basename,
        chapterNumber: parseInt(file.basename.split("-")[1], 10),
        title: getChapterTitle(parseChapterIntoDom(content.toString("utf-8"))),
        paragraphCount,
        sourceFormat: "html",
      });
      console.log(`Uploaded ${slug}/${file.basename}`);
      stats.uploaded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to upload ${slug}/${file.basename}: ${message}`);
    }
  }

  return stats;
}

async function main() {
  const { sourceRoot, slugs, dryRun, allowNew } = parseArgs();
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    console.error("Missing CONVEX_URL environment variable");
    process.exit(1);
  }

  if (!fs.existsSync(sourceRoot)) {
    console.error(`Source root not found: ${sourceRoot}`);
    process.exit(1);
  }

  const adminClient = new AdminConvexHttpClient(convexUrl);
  const targetSlugs = slugs ?? listSlugs(sourceRoot);
  const totals = { uploaded: 0, skipped: 0, missing: 0, total: 0 };

  for (const slug of targetSlugs) {
    if (PLAY_SLUGS.has(slug)) continue;

    const inputDir = path.join(sourceRoot, slug, "chapters-source");
    if (!fs.existsSync(inputDir)) {
      console.warn(`Skipping ${slug}: missing ${inputDir}`);
      continue;
    }

    const stats = await uploadSlug(slug, inputDir, adminClient, dryRun, allowNew);
    totals.uploaded += stats.uploaded;
    totals.skipped += stats.skipped;
    totals.missing += stats.missing;
    totals.total += stats.total;
  }

  console.log(
    `Done. Uploaded: ${totals.uploaded}, skipped: ${totals.skipped}, missing: ${totals.missing}, total: ${totals.total}`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
