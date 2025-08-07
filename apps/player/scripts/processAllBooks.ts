#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { processBook } from "./processBook";

const PUBLIC_BOOKS_DIR = path.join(__dirname, "..", "public_books");

async function processAllBooks(docker: boolean = false) {
  const DIST_DIR = docker ? path.join(__dirname, "..", "docker-build", "books") : path.join(__dirname, "..", "dist", "books");
  console.log("🚀 Starting to process all books...\n");

  // Get all directories in public_books
  const bookDirs = fs
    .readdirSync(PUBLIC_BOOKS_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  console.log(`📚 Found ${bookDirs.length} books: ${bookDirs.join(", ")}\n`);

  let successCount = 0;
  let failCount = 0;
  const errors: { book: string; error: Error }[] = [];

  // Process all books in parallel
  const results = await Promise.all(bookDirs.map((bookName) => processBook(path.join(PUBLIC_BOOKS_DIR, bookName), DIST_DIR)));

  for (const result of results) {
    if (result.success) {
      successCount++;
    } else {
      failCount++;
      errors.push({ book: result.book, error: result.error });
    }
  }

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 SUMMARY");
  console.log(`${"=".repeat(60)}`);
  console.log(`✅ Successfully processed: ${successCount} books`);
  console.log(`❌ Failed: ${failCount} books`);

  if (errors.length > 0) {
    console.log("\n❌ ERRORS:");
    errors.forEach(({ book, error }) => {
      console.log(`   - ${book}: ${error.message}`);
    });
  }

  console.log(`\n🎉 Processing complete!`);
}

// Run the script
processAllBooks(process.argv.includes("--docker")).catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
