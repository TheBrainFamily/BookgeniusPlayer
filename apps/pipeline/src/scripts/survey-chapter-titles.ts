#!/usr/bin/env bun
/**
 * Survey chapter titles across all books to find extraction issues.
 * Reads from ConvexAssets/books/<slug>/chapters-source/*.html
 *
 * Usage:
 *   bun apps/pipeline/src/scripts/survey-chapter-titles.ts
 */

import fs from "fs";
import path from "path";
import { ensureDomParser } from "../lib/domParser";
import { getChapterTitle } from "../tools/new-tooling/get-chapter-title";

ensureDomParser();

const CONVEX_ASSETS = path.resolve("ConvexAssets/books");
const BOOKS_DATA = path.resolve("apps/pipeline/books-data");

function parseHtml(html: string): Element {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.documentElement;
}

type BookResult = {
  slug: string;
  chapters: Array<{ basename: string; title: string }>;
  issues: string[];
};

function surveyBook(slug: string): BookResult | null {
  const chaptersDir = path.join(CONVEX_ASSETS, slug, "chapters-source");
  if (!fs.existsSync(chaptersDir)) return null;

  const files = fs
    .readdirSync(chaptersDir)
    .filter((f) => f.endsWith(".html"))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10);
      return na - nb;
    });

  if (files.length === 0) return null;

  const chapters: Array<{ basename: string; title: string }> = [];
  const issues: string[] = [];

  for (const file of files) {
    const html = fs.readFileSync(path.join(chaptersDir, file), "utf-8");
    const dom = parseHtml(html);
    const title = getChapterTitle(dom);

    chapters.push({ basename: file, title });

    if (!title || title === "") {
      issues.push(`${file}: EMPTY title`);
    } else if (title === "Chapter") {
      issues.push(`${file}: generic "Chapter" (missing ordinal)`);
    }
  }

  return { slug, chapters, issues };
}

function main() {
  // Get slugs from books-data
  const bookSlugs = fs
    .readdirSync(BOOKS_DATA)
    .filter((f) => fs.statSync(path.join(BOOKS_DATA, f)).isDirectory());

  console.log(`Found ${bookSlugs.length} books in books-data\n`);

  const results: BookResult[] = [];
  let booksWithIssues = 0;
  let booksOk = 0;
  let booksSkipped = 0;

  for (const slug of bookSlugs.sort()) {
    const result = surveyBook(slug);
    if (!result) {
      booksSkipped += 1;
      continue;
    }

    results.push(result);

    if (result.issues.length > 0) {
      booksWithIssues += 1;
      console.log(`\n❌ ${slug} (${result.chapters.length} chapters)`);
      for (const issue of result.issues) {
        console.log(`   ${issue}`);
      }
    } else {
      booksOk += 1;
    }
  }

  // Print OK books with their titles for review
  console.log("\n\n=== BOOKS WITH TITLES (spot check) ===\n");
  for (const result of results) {
    if (result.issues.length > 0) continue;
    const sample = result.chapters.slice(0, 3);
    const titles = sample.map((c) => `"${c.title}"`).join(", ");
    const more = result.chapters.length > 3 ? ` ... +${result.chapters.length - 3} more` : "";
    console.log(`✅ ${result.slug}: ${titles}${more}`);
  }

  // Check for duplicate titles within books
  console.log("\n\n=== DUPLICATE TITLES ===\n");
  for (const result of results) {
    const titleCounts = new Map<string, string[]>();
    for (const ch of result.chapters) {
      const list = titleCounts.get(ch.title) ?? [];
      list.push(ch.basename);
      titleCounts.set(ch.title, list);
    }
    const dupes = [...titleCounts.entries()].filter(([, files]) => files.length > 1);
    if (dupes.length > 0) {
      for (const [title, files] of dupes) {
        console.log(`  ${result.slug}: "${title}" x${files.length}: ${files.join(", ")}`);
      }
    }
  }

  console.log(`\n\n=== SUMMARY ===`);
  console.log(
    `OK: ${booksOk}, Issues: ${booksWithIssues}, Skipped (no chapters-source): ${booksSkipped}`,
  );
}

main();
