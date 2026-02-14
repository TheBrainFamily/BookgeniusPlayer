#!/usr/bin/env bun
/**
 * Backfill chapter titles from HTML content already stored in Convex.
 *
 * Reads each chapter's HTML via the Convex `getTextContent` action,
 * parses it, extracts the title with `getChapterTitle`, and updates
 * the chapterMetadata record.
 *
 * Usage:
 *   bun apps/pipeline/src/scripts/backfill-chapter-titles.ts <book-slug> [--dry-run]
 *   bun apps/pipeline/src/scripts/backfill-chapter-titles.ts --all [--dry-run]
 */

import "dotenv/config";
import { AdminConvexHttpClient } from "../lib/AdminConvexHttpClient";
import { api } from "@bookgenius/convex/_generated/api";
import { ensureDomParser } from "../lib/domParser";
import { getChapterTitle } from "../tools/new-tooling/get-chapter-title";

ensureDomParser();

type Args = { bookSlug?: string; all: boolean; dryRun: boolean };

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const dryRun = args.includes("--dry-run");
  let bookSlug: string | undefined;
  for (const arg of args) {
    if (!arg.startsWith("--") && !bookSlug) {
      bookSlug = arg;
    }
  }

  if (!all && !bookSlug) {
    console.error(
      "Usage: bun apps/pipeline/src/scripts/backfill-chapter-titles.ts <book-slug> [--dry-run]",
    );
    console.error(
      "   or: bun apps/pipeline/src/scripts/backfill-chapter-titles.ts --all [--dry-run]",
    );
    process.exit(1);
  }

  return { bookSlug, all, dryRun };
}

function parseChapterIntoDom(html: string): Element {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.documentElement;
}

async function listBookPaths(client: AdminConvexHttpClient): Promise<string[]> {
  const books = await client.query(api.bookQueries.listBooks, {});
  return books.map((b) => b.path);
}

async function backfillBook(
  client: AdminConvexHttpClient,
  bookPath: string,
  options: { dryRun: boolean },
): Promise<{ scanned: number; updated: number; skipped: number; failed: number }> {
  const chapters = await client.query(api.bookQueries.listHtmlSourceChapters, { bookPath });

  if (!chapters || chapters.length === 0) {
    console.log(`[backfill] ${bookPath}: no chapters-source files found`);
    return { scanned: 0, updated: 0, skipped: 0, failed: 0 };
  }

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const chapter of chapters) {
    scanned += 1;

    const result = await client.action(api.cli.getTextContent, { versionId: chapter.versionId });
    const html = result?.content ?? "";
    if (!html) {
      console.warn(`[backfill] ${bookPath}/${chapter.basename}: empty content`);
      failed += 1;
      continue;
    }

    const dom = parseChapterIntoDom(html);
    const newTitle = getChapterTitle(dom);
    const oldTitle = chapter.title ?? "(none)";

    if (newTitle === oldTitle) {
      skipped += 1;
      continue;
    }

    if (options.dryRun) {
      console.log(`[dry-run] ${bookPath}/${chapter.basename}: "${oldTitle}" -> "${newTitle}"`);
      updated += 1;
      continue;
    }

    try {
      await client.mutation(api.metadata.updateChapterMetadata, {
        bookPath,
        folderPath: `${bookPath}/chapters-source`,
        basename: chapter.basename,
        chapterNumber: chapter.chapterNumber,
        title: newTitle,
        sourceFormat: chapter.sourceFormat ?? "html",
      });
      updated += 1;
      console.log(`[backfill] ${bookPath}/${chapter.basename}: "${oldTitle}" -> "${newTitle}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[backfill] ${bookPath}/${chapter.basename} failed: ${message}`);
      failed += 1;
    }
  }

  return { scanned, updated, skipped, failed };
}

async function main() {
  const { bookSlug, all, dryRun } = parseArgs();
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    console.error("Missing CONVEX_URL environment variable");
    process.exit(1);
  }

  const client = new AdminConvexHttpClient(convexUrl);
  const bookPaths = all
    ? await listBookPaths(client)
    : [`books/${bookSlug?.replace(/^books\//, "")}`];

  let totalScanned = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const bookPath of bookPaths) {
    console.log(`\n[backfill] Processing ${bookPath}...`);
    const result = await backfillBook(client, bookPath, { dryRun });
    totalScanned += result.scanned;
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
    totalFailed += result.failed;
  }

  console.log(
    `\n[backfill] Done. scanned=${totalScanned} updated=${totalUpdated} skipped=${totalSkipped} failed=${totalFailed}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[backfill] Fatal error: ${message}`);
  process.exit(1);
});
