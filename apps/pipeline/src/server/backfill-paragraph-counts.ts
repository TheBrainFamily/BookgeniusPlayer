#!/usr/bin/env bun
/**
 * Backfill paragraphCount for chapters-source metadata using player indexing rules.
 *
 * Usage:
 *   bun apps/pipeline/src/server/backfill-paragraph-counts.ts <book-slug> [--dry-run] [--limit N]
 *   bun apps/pipeline/src/server/backfill-paragraph-counts.ts --all [--dry-run] [--limit N]
 */

import "dotenv/config";
import { AdminConvexHttpClient } from "../lib/AdminConvexHttpClient";
import { api } from "@bookgenius/convex/_generated/api";
import { computeParagraphCount } from "../lib/paragraphCount";

type Args = { bookSlug?: string; all: boolean; dryRun: boolean; limit?: number };

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const dryRun = args.includes("--dry-run");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : undefined;
  let bookSlug: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--limit") {
      i += 1;
      continue;
    }
    if (!arg.startsWith("--") && !bookSlug) {
      bookSlug = arg;
    }
  }

  if (!all && !bookSlug) {
    console.error(
      "Usage: bun apps/pipeline/src/server/backfill-paragraph-counts.ts <book-slug> [--dry-run] [--limit N]",
    );
    console.error(
      "   or: bun apps/pipeline/src/server/backfill-paragraph-counts.ts --all [--dry-run] [--limit N]",
    );
    process.exit(1);
  }

  return { bookSlug, all, dryRun, limit: Number.isFinite(limit) ? limit : undefined };
}

async function listBookPaths(client: AdminConvexHttpClient): Promise<string[]> {
  const books = await client.query(api.bookQueries.listBooks, {});
  return books.map((b) => b.path);
}

async function backfillBook(
  client: AdminConvexHttpClient,
  bookPath: string,
  options: { dryRun: boolean; limit?: number },
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
    const existingCount = chapter.paragraphCount ?? 0;
    if (existingCount > 0) {
      skipped += 1;
      continue;
    }

    if (options.limit !== undefined && updated >= options.limit) {
      break;
    }

    const result = await client.action(api.cli.getTextContent, { versionId: chapter.versionId });

    const html = result?.content ?? "";
    if (!html) {
      console.warn(`[backfill] ${bookPath}/${chapter.basename}: empty content`);
      failed += 1;
      continue;
    }

    const paragraphCount = computeParagraphCount(html);

    if (options.dryRun) {
      console.log(`[dry-run] ${bookPath}/${chapter.basename} -> paragraphCount=${paragraphCount}`);
      updated += 1;
      continue;
    }

    try {
      await client.mutation(api.metadata.updateChapterMetadata, {
        bookPath,
        folderPath: `${bookPath}/chapters-source`,
        basename: chapter.basename,
        chapterNumber: chapter.chapterNumber,
        paragraphCount,
        sourceFormat: chapter.sourceFormat ?? "html",
      });
      updated += 1;
      console.log(
        `[backfill] ${bookPath}/${chapter.basename} set paragraphCount=${paragraphCount}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[backfill] ${bookPath}/${chapter.basename} failed to update: ${message}`);
      failed += 1;
    }
  }

  return { scanned, updated, skipped, failed };
}

async function main() {
  const { bookSlug, all, dryRun, limit } = parseArgs();
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

  let remainingLimit = limit;

  for (const bookPath of bookPaths) {
    console.log(`\n[backfill] Processing ${bookPath}...`);
    const result = await backfillBook(client, bookPath, { dryRun, limit: remainingLimit });
    totalScanned += result.scanned;
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
    totalFailed += result.failed;

    if (remainingLimit !== undefined) {
      remainingLimit -= result.updated;
      if (remainingLimit <= 0) {
        break;
      }
    }
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
