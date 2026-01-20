/**
 * Quick script to show chapter page ranges for manual verification.
 * Usage: bun apps/pipeline/src/tools/showChapterPages.ts [bookSlug]
 */

import fs from "fs/promises";
import path from "path";

const SCANNED_BOOKS_DIR = path.join(__dirname, "../../scanned-books");

async function findLatestSession(bookSlug: string): Promise<string | null> {
  const bookDir = path.join(SCANNED_BOOKS_DIR, bookSlug);
  try {
    const entries = await fs.readdir(bookDir);
    const sessionDirs = entries.filter((e) => e.startsWith("session-"));
    if (sessionDirs.length === 0) return null;

    let latest = sessionDirs[0];
    let latestTime = 0;
    for (const dir of sessionDirs) {
      const stat = await fs.stat(path.join(bookDir, dir));
      if (stat.mtimeMs > latestTime) {
        latestTime = stat.mtimeMs;
        latest = dir;
      }
    }
    return latest.replace("session-", "");
  } catch {
    return null;
  }
}

async function main() {
  const bookSlug = process.argv[2] || "low";

  const sessionId = await findLatestSession(bookSlug);
  if (!sessionId) {
    console.error(`No sessions found for book: ${bookSlug}`);
    process.exit(1);
  }

  const chaptersPath = path.join(
    SCANNED_BOOKS_DIR,
    bookSlug,
    `session-${sessionId}`,
    "chapters.json",
  );

  const content = await fs.readFile(chaptersPath, "utf-8");
  const data = JSON.parse(content);

  console.log(`\n📖 Chapter Pages for: ${bookSlug}\n`);
  console.log("─".repeat(50));

  for (const chapter of data.chapters) {
    const start = chapter.startPageNumber;
    const end = chapter.endPageNumber;
    const pageCount = chapter.pages.length;
    const title = chapter.title ? ` "${chapter.title}"` : "";

    console.log(`Chapter ${chapter.chapterNumber}${title}`);
    console.log(`  Pages: ${start} - ${end} (${pageCount} pages)`);
  }

  console.log("─".repeat(50));
  console.log(`Total: ${data.allPages.length} logical pages\n`);
}

main().catch(console.error);
