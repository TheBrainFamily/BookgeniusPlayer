/**
 * Interactive CLI tool to review and adjust paragraph index mappings.
 * Shows old vs new content and allows manual verification/adjustment.
 */

import { readFileSync, writeFileSync } from "fs";
import * as readline from "readline";
import type { BookMigrationPlan, ChapterMigration, IndexMapping } from "./types";

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

function truncate(text: string, maxLen: number = 100): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function printMapping(mapping: IndexMapping, showContent: boolean = true) {
  const confidenceColor =
    mapping.confidence === "exact"
      ? COLORS.green
      : mapping.confidence === "fuzzy"
        ? COLORS.yellow
        : COLORS.red;

  console.log(
    `\n  ${COLORS.bright}Old index ${mapping.oldIndex}${COLORS.reset} → ` +
      `${COLORS.bright}New index ${mapping.newIndex}${COLORS.reset} ` +
      `${confidenceColor}[${mapping.confidence} ${(mapping.similarity * 100).toFixed(0)}%]${COLORS.reset}`,
  );

  if (showContent) {
    console.log(`  ${COLORS.gray}Old:${COLORS.reset} ${truncate(mapping.oldContent)}`);
    console.log(`  ${COLORS.gray}New:${COLORS.reset} ${truncate(mapping.newContent)}`);
  }
}

async function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function reviewChapter(chapter: ChapterMigration): Promise<boolean> {
  console.log(
    `\n${COLORS.blue}━━━ Chapter ${chapter.chapter} ━━━${COLORS.reset} (${chapter.affectedCues.length} affected cues)`,
  );

  // Get unique mappings that affect cues
  const relevantMappings = chapter.mappings.filter((m) =>
    chapter.affectedCues.some((cue) => cue.paragraph === m.oldIndex),
  );

  if (relevantMappings.length === 0) {
    console.log(`  ${COLORS.green}✓ No mappings need review (all at paragraph 0)${COLORS.reset}`);
    return true;
  }

  // Show all mappings
  for (const mapping of relevantMappings) {
    printMapping(mapping);

    // Find cues using this mapping
    const cuesHere = chapter.affectedCues.filter((c) => c.paragraph === mapping.oldIndex);
    console.log(
      `  ${COLORS.gray}Affects ${cuesHere.length} cue(s): ${cuesHere.map((c) => c.fileBasename).join(", ")}${COLORS.reset}`,
    );
  }

  // Ask for confirmation
  const needsReview = relevantMappings.some((m) => m.confidence !== "exact");

  if (!needsReview) {
    console.log(`\n  ${COLORS.green}All mappings are exact matches.${COLORS.reset}`);
    return true;
  }

  const answer = await promptUser(
    `\n  ${COLORS.yellow}Review needed.${COLORS.reset} Approve these mappings? (y/n/skip): `,
  );

  if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
    return true;
  } else if (answer.toLowerCase() === "skip" || answer.toLowerCase() === "s") {
    console.log(`  ${COLORS.gray}Skipping chapter for now...${COLORS.reset}`);
    return false;
  } else {
    console.log(`  ${COLORS.red}Rejected. You'll need to manually adjust the mapping.${COLORS.reset}`);
    return false;
  }
}

export async function reviewMigrationPlan(planPath: string): Promise<void> {
  console.log(`\n📋 Loading migration plan from ${planPath}...`);

  const plan: BookMigrationPlan = JSON.parse(readFileSync(planPath, "utf-8"));

  console.log(
    `\n${COLORS.bright}Book: ${plan.bookSlug}${COLORS.reset} (${plan.totalCues} total cues)`,
  );

  const results = {
    approved: [] as number[],
    rejected: [] as number[],
    skipped: [] as number[],
  };

  // Review each chapter
  for (const chapter of plan.chapters) {
    const approved = await reviewChapter(chapter);

    if (approved) {
      results.approved.push(chapter.chapter);
    } else {
      results.rejected.push(chapter.chapter);
    }
  }

  // Summary
  console.log(`\n${COLORS.blue}━━━ Review Summary ━━━${COLORS.reset}`);
  console.log(`  ${COLORS.green}✓ Approved: ${results.approved.length} chapters${COLORS.reset}`);
  console.log(`  ${COLORS.red}✗ Rejected: ${results.rejected.length} chapters${COLORS.reset}`);

  if (results.rejected.length === 0) {
    console.log(
      `\n  ${COLORS.green}${COLORS.bright}✓ All chapters approved!${COLORS.reset} Ready to apply migration.`,
    );
    console.log(`  ${COLORS.gray}Run: bun apply-migration.ts ${plan.bookSlug}${COLORS.reset}`);
  } else {
    console.log(
      `\n  ${COLORS.yellow}⚠️  Some chapters need manual review.${COLORS.reset} Fix mappings before applying.`,
    );
  }
}

if (require.main === module) {
  const planPath = process.argv[2];
  if (!planPath) {
    console.error("Usage: bun review-mappings-cli.ts <plan.json>");
    process.exit(1);
  }

  reviewMigrationPlan(planPath)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}
