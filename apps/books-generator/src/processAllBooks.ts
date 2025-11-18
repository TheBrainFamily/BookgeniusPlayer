#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { processBook } from "./processBook";

const projectRoot = path.join(__dirname, "..", "..", "..");
export const PUBLIC_BOOKS_DIR = path.join(projectRoot, "books");
// const PUBLIC_BOOKS_DIR = path.join(projectRoot, "apps", "player", "public_books");

function parseArgs() {
  const args = new Map<string, string | boolean>();
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--only=")) args.set("only", arg.split("=")[1]);
  }
  return {
    only:
      (args.get("only") as string | undefined)
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? undefined,
  };
}

async function processAllBooks(only?: string[]) {
  console.log("🚀 Starting to process books...\n");

  // Get all directories in public_books
  const all = fs
    .readdirSync(PUBLIC_BOOKS_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
  const bookDirs = only ? all.filter((n) => only.includes(n)) : all;

  console.log(`📚 Will process ${bookDirs.length} books: ${bookDirs.join(", ")}`);

  let successCount = 0;
  let failCount = 0;
  const errors: { book: string; error: Error }[] = [];

  // Process all books in parallel
  const resultsFull = await Promise.all(bookDirs.map((bookName) => processBook(path.join(PUBLIC_BOOKS_DIR, bookName), false)));
  // Process demo versions - same source, different output
  const resultsDemo = await Promise.all(
    bookDirs.map((bookName) =>
      processBook(
        path.join(PUBLIC_BOOKS_DIR, bookName), // Same source as full book
        true, // isDemo flag
      ),
    ),
  );

  for (const result of [...resultsFull, ...resultsDemo]) {
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

if (require.main === module) {
  const { only } = parseArgs();
  processAllBooks(only).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
