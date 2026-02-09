/**
 * Main migration orchestrator for a single book.
 *
 * Steps:
 * 1. Snapshot cues to backup JSON
 * 2. Build migration plan (old → new index mappings)
 * 3. Save plan for review
 * 4. Review with CLI tool (manual step)
 * 5. Apply migration (separate script)
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { snapshotBookCues } from "./snapshot-book-cues";
import { buildBookMigrationPlan } from "./build-index-mappings";
import type { CueSnapshot } from "./types";
import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_URL || "https://willing-pig-943.convex.cloud";
const PLANS_DIR = join(__dirname, "plans");

async function migrateBook(bookSlug: string): Promise<void> {
  const bookPath = `books/${bookSlug}`;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📚 Starting migration for: ${bookSlug}`);
  console.log(`${"=".repeat(60)}`);

  // Step 1: Snapshot cues
  console.log(`\n[1/3] 📸 Snapshotting cues...`);
  const snapshotPath = await snapshotBookCues(bookPath);

  // Step 2: Get cues from Convex
  console.log(`\n[2/3] 📥 Fetching cues from Convex...`);
  const client = new ConvexHttpClient(CONVEX_URL);
  const result = (await client.query("migration:getAllCuesForBook" as any, {
    bookPath,
  })) as {
    bookPath: string;
    backgroundCues: any[];
    musicCues: any[];
  };

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

  console.log(`   Found ${allCues.length} total cues`);

  // Step 3: Build migration plan
  console.log(`\n[3/3] 🔄 Building migration plan...`);
  const plan = await buildBookMigrationPlan(bookSlug, allCues, snapshotPath);

  // Save plan
  mkdirSync(PLANS_DIR, { recursive: true });
  const planFilename = `${bookSlug}-${Date.now()}.json`;
  const planPath = join(PLANS_DIR, planFilename);

  writeFileSync(planPath, JSON.stringify(plan, null, 2));

  console.log(`\n✅ Migration plan saved to: ${planFilename}`);

  // Summary
  const totalMappings = plan.chapters.reduce((sum: number, ch: any) => sum + ch.mappings.length, 0);
  const exactMappings = plan.chapters.reduce(
    (sum: number, ch: any) => sum + ch.mappings.filter((m: any) => m.confidence === "exact").length,
    0,
  );
  const fuzzyMappings = plan.chapters.reduce(
    (sum: number, ch: any) => sum + ch.mappings.filter((m: any) => m.confidence === "fuzzy").length,
    0,
  );
  const manualMappings = plan.chapters.reduce(
    (sum: number, ch: any) =>
      sum + ch.mappings.filter((m: any) => m.confidence === "manual").length,
    0,
  );

  console.log(`\n📊 Summary:`);
  console.log(`   Total cues: ${allCues.length}`);
  console.log(`   Total mappings: ${totalMappings}`);
  console.log(`   - Exact: ${exactMappings}`);
  console.log(`   - Fuzzy: ${fuzzyMappings}`);
  console.log(`   - Manual review: ${manualMappings}`);

  console.log(`\n🔍 Next step: Review mappings`);
  console.log(`   bun apps/pipeline/src/tools/migration/review-mappings-cli.ts ${planPath}`);

  console.log(`\n💾 Backup saved to: ${snapshotPath}`);
}

if (require.main === module) {
  const bookSlug = process.argv[2];
  if (!bookSlug) {
    console.error("Usage: bun migrate-book.ts <bookSlug>");
    console.error("Example: bun migrate-book.ts Lalka");
    process.exit(1);
  }

  migrateBook(bookSlug)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Error:", err);
      process.exit(1);
    });
}

export { migrateBook };
