/**
 * Download and backup all cues for a book before migration.
 * Saves to: apps/pipeline/src/tools/migration/backups/{slug}-{timestamp}.json
 */

import { ConvexHttpClient } from "convex/browser";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { CueSnapshot } from "./types";

const CONVEX_URL = process.env.CONVEX_URL || "https://willing-pig-943.convex.cloud";
const BACKUP_DIR = join(__dirname, "backups");

interface ConvexCue {
  _id: string;
  chapter: number;
  paragraph: number;
  fileBasename: string;
  backgroundColor?: string;
  textColor?: string;
  order?: number;
}

async function snapshotBookCues(bookPath: string): Promise<string> {
  const client = new ConvexHttpClient(CONVEX_URL);

  console.log(`📸 Snapshotting cues for ${bookPath}...`);

  const result = (await client.query("migration:getAllCuesForBook" as any, {
    bookPath,
  })) as {
    bookPath: string;
    backgroundCues: ConvexCue[];
    musicCues: ConvexCue[];
    timestamp: number;
  };

  // Convert to unified format
  const allCues: CueSnapshot[] = [
    ...result.backgroundCues.map((c) => ({
      _id: c._id,
      chapter: c.chapter,
      paragraph: c.paragraph,
      fileBasename: c.fileBasename,
      type: "background" as const,
      backgroundColor: c.backgroundColor,
      textColor: c.textColor,
    })),
    ...result.musicCues.map((c) => ({
      _id: c._id,
      chapter: c.chapter,
      paragraph: c.paragraph,
      fileBasename: c.fileBasename,
      type: "music" as const,
      order: c.order,
    })),
  ];

  // Save to file
  mkdirSync(BACKUP_DIR, { recursive: true });
  const slug = bookPath.replace("books/", "");
  const timestamp = Date.now();
  const filename = `${slug}-${timestamp}.json`;
  const filepath = join(BACKUP_DIR, filename);

  writeFileSync(
    filepath,
    JSON.stringify(
      {
        bookPath,
        slug,
        timestamp,
        totalCues: allCues.length,
        cues: allCues,
      },
      null,
      2,
    ),
  );

  console.log(`✅ Saved ${allCues.length} cues to ${filename}`);

  return filepath;
}

if (require.main === module) {
  const bookPath = process.argv[2];
  if (!bookPath) {
    console.error("Usage: bun snapshot-book-cues.ts <bookPath>");
    console.error("Example: bun snapshot-book-cues.ts books/Lalka");
    process.exit(1);
  }

  snapshotBookCues(bookPath)
    .then((filepath) => {
      console.log(`\n📦 Backup saved to: ${filepath}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}

export { snapshotBookCues };
