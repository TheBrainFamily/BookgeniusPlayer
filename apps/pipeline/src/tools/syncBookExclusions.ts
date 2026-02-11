#!/usr/bin/env bun
/**
 * Compute which SE books in Convex have incomplete pipelines and upload
 * the exclusion list so listAvailableBookSlugs filters them out.
 *
 * Usage: bun apps/pipeline/src/tools/syncBookExclusions.ts
 */
import fs from "fs";
import path from "path";
import { AdminConvexHttpClient } from "../lib/AdminConvexHttpClient";
import { api } from "@bookgenius/convex/_generated/api";
import "dotenv/config";

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) throw new Error("Missing CONVEX_URL environment variable");

const client = new AdminConvexHttpClient(CONVEX_URL);

const booksDataDir = path.resolve(__dirname, "../../books-data");
const seBooksDir = path.resolve(__dirname, "../../standardebooks-data/books");

const FINAL_STEP = "upload_answer_server_data";

interface PipelineProgress {
  lastCompletedStep: string | null;
  lastAttemptedStep: string | null;
}

async function main() {
  console.log("=".repeat(60));
  console.log("SYNC BOOK EXCLUSIONS");
  console.log("=".repeat(60));

  // 1. Get all book slugs from Convex
  const convexBooks = await client.query(api.bookQueries.listBooks);
  const convexSlugs = new Set(convexBooks.map((b) => b.slug));
  console.log(`Convex books: ${convexSlugs.size}`);

  // 2. Get the set of SE slugs (from standardebooks-data/books/)
  const seSlugs = new Set<string>();
  if (fs.existsSync(seBooksDir)) {
    for (const entry of fs.readdirSync(seBooksDir, { withFileTypes: true })) {
      if (entry.isDirectory()) seSlugs.add(entry.name);
    }
  }
  console.log(`SE books locally: ${seSlugs.size}`);

  // 3. For each Convex slug that is an SE book, check pipeline status
  const exclusions: { slug: string; reason: string }[] = [];

  for (const slug of convexSlugs) {
    if (!seSlugs.has(slug)) continue; // Not an SE book — skip

    const progressPath = path.join(booksDataDir, slug, "temporary-output/pipeline-progress.json");

    if (!fs.existsSync(progressPath)) {
      exclusions.push({ slug, reason: "pipeline incomplete: no progress file" });
      continue;
    }

    const progress: PipelineProgress = JSON.parse(fs.readFileSync(progressPath, "utf-8"));

    if (progress.lastCompletedStep !== FINAL_STEP) {
      const step = progress.lastCompletedStep ?? "none";
      exclusions.push({ slug, reason: `pipeline incomplete: ${step}` });
    }
  }

  // Sort for stable output
  exclusions.sort((a, b) => a.slug.localeCompare(b.slug));

  console.log(`\nExcluding ${exclusions.length} books:`);
  for (const { slug, reason } of exclusions) {
    console.log(`  - ${slug} (${reason})`);
  }

  // 4. Upload to Convex
  const result = await client.mutation(api.bookQueries.syncBookExclusions, { exclusions });
  console.log(`\nSynced: deleted ${result.deleted}, inserted ${result.inserted}`);
}

main().catch(console.error);
