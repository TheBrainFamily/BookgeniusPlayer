#!/usr/bin/env tsx
/**
 * Script to fetch all Wolne Lektury collections and save them as JSON files.
 * Also outputs a summary with total book counts.
 *
 * Usage: tsx src/fetch-all-collections.ts
 */

import fs from "fs";
import path from "path";

const API_URL = "https://wolnelektury.pl/api";
const OUTPUT_DIR = path.resolve(__dirname, "../../wolnelektury-data");

interface WLCollectionSummary {
  url: string;
  href: string;
  title: string;
}

interface WLBook {
  kind: string;
  full_sort_key: string;
  title: string;
  url: string;
  cover_color: string;
  author: string;
  cover: string;
  epoch: string;
  href: string;
  has_audio: boolean;
  genre: string;
  simple_thumb: string;
  slug: string;
  cover_thumb: string;
  liked: null | boolean;
}

interface WLCollectionDetails {
  url: string;
  title?: string;
  books: WLBook[];
}

interface CollectionData {
  slug: string;
  title: string;
  url: string;
  bookCount: number;
  books: WLBook[];
  fetchedAt: string;
}

interface SummaryData {
  totalCollections: number;
  totalBooks: number;
  totalUniqueBooks: number;
  collections: Array<{ slug: string; title: string; bookCount: number }>;
  fetchedAt: string;
}

function extractSlugFromHref(href: string): string {
  const match = href.match(/\/api\/collections\/([^/]+)\/?$/);
  return match ? match[1] : href;
}

async function fetchCollections(): Promise<WLCollectionSummary[]> {
  console.log("Fetching collections list...");
  const response = await fetch(`${API_URL}/collections/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch collections: ${response.status}`);
  }
  return response.json();
}

async function fetchCollectionDetails(slug: string): Promise<WLCollectionDetails> {
  const response = await fetch(`${API_URL}/collections/${slug}/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch collection ${slug}: ${response.status}`);
  }
  return response.json();
}

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const collectionsDir = path.join(OUTPUT_DIR, "collections");
  if (!fs.existsSync(collectionsDir)) {
    fs.mkdirSync(collectionsDir, { recursive: true });
  }

  // Fetch all collections
  const collections = await fetchCollections();
  console.log(`Found ${collections.length} collections`);

  const allBooks = new Set<string>();
  const summaryCollections: SummaryData["collections"] = [];
  let totalBooks = 0;

  // Fetch each collection's details
  for (let i = 0; i < collections.length; i++) {
    const collection = collections[i];
    const slug = extractSlugFromHref(collection.href);

    console.log(`[${i + 1}/${collections.length}] Fetching ${slug}...`);

    try {
      const details = await fetchCollectionDetails(slug);

      const collectionData: CollectionData = {
        slug,
        title: collection.title,
        url: collection.url,
        bookCount: details.books.length,
        books: details.books,
        fetchedAt: new Date().toISOString(),
      };

      // Save individual collection file
      const collectionPath = path.join(collectionsDir, `${slug}.json`);
      fs.writeFileSync(collectionPath, JSON.stringify(collectionData, null, 2));

      // Track unique books
      details.books.forEach((book) => allBooks.add(book.slug));
      totalBooks += details.books.length;

      summaryCollections.push({ slug, title: collection.title, bookCount: details.books.length });

      console.log(`  -> ${details.books.length} books`);

      // Small delay to be nice to their API
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`  -> Failed to fetch ${slug}:`, error);
      summaryCollections.push({ slug, title: collection.title, bookCount: 0 });
    }
  }

  // Sort by book count (descending)
  summaryCollections.sort((a, b) => b.bookCount - a.bookCount);

  // Create summary file
  const summary: SummaryData = {
    totalCollections: collections.length,
    totalBooks,
    totalUniqueBooks: allBooks.size,
    collections: summaryCollections,
    fetchedAt: new Date().toISOString(),
  };

  const summaryPath = path.join(OUTPUT_DIR, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total collections: ${summary.totalCollections}`);
  console.log(`Total books (including duplicates): ${summary.totalBooks}`);
  console.log(`Total unique books: ${summary.totalUniqueBooks}`);
  console.log(`\nOutput saved to: ${OUTPUT_DIR}`);
  console.log("\nTop 10 collections by book count:");
  summaryCollections.slice(0, 10).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.title}: ${c.bookCount} books`);
  });
}

main().catch(console.error);
