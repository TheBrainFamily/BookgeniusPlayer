#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { processBook } from "./processBook";

const PUBLIC_BOOKS_DIR = path.join(__dirname, "..", "public_books");

function parseArgs() {
  const args = new Map<string, string | boolean>();
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--only=")) args.set("only", arg.split("=")[1]);
    else if (arg === "--docker") args.set("docker", true);
  }
  return {
    docker: Boolean(args.get("docker")),
    only:
      (args.get("only") as string | undefined)
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? undefined,
  };
}

async function processAllBooks(docker: boolean = false, only?: string[]) {
  const DIST_DIR = docker ? path.join(__dirname, "..", "docker-build", "books") : path.join(__dirname, "..", "public", "books");
  const PUBLIC_DIR = docker ? path.join(__dirname, "..", "docker-build", "books") : path.join(__dirname, "..", "public", "books");

  // Check if we need to recompile by comparing timestamps
  if (!docker && fs.existsSync(PUBLIC_DIR) && !only?.length) {
    try {
      const publicBooksStats = fs.statSync(PUBLIC_BOOKS_DIR);
      const publicDirStats = fs.statSync(PUBLIC_DIR);

      // Get the most recent modification time in public_books
      let mostRecentPublicBooks = publicBooksStats.mtime.getTime();
      const bookDirs = fs.readdirSync(PUBLIC_BOOKS_DIR, { withFileTypes: true }).filter((dirent) => dirent.isDirectory());

      for (const dir of bookDirs) {
        const dirPath = path.join(PUBLIC_BOOKS_DIR, dir.name);
        const dirStats = fs.statSync(dirPath);
        mostRecentPublicBooks = Math.max(mostRecentPublicBooks, dirStats.mtime.getTime());

        // Check files within each book directory
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const fileStats = fs.statSync(filePath);
          mostRecentPublicBooks = Math.max(mostRecentPublicBooks, fileStats.mtime.getTime());
        }
      }

      // If public/books is newer than public_books, skip compilation
      if (publicDirStats.mtime.getTime() > mostRecentPublicBooks) {
        console.log("✅ public/books is up to date. Skipping compilation.");
        return;
      }
    } catch (error) {
      // If there's any error checking timestamps, just proceed with compilation
      console.log("⚠️ Could not check timestamps, proceeding with compilation...");
    }
  }

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
  const resultsFull = await Promise.all(bookDirs.map((bookName) => processBook(path.join(PUBLIC_BOOKS_DIR, bookName), DIST_DIR, false)));
  // Process demo versions - same source, different output
  const resultsDemo = await Promise.all(
    bookDirs.map((bookName) =>
      processBook(
        path.join(PUBLIC_BOOKS_DIR, bookName), // Same source as full book
        DIST_DIR,
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

const { docker, only } = parseArgs();
processAllBooks(docker, only).catch((e) => {
  console.error(e);
  process.exit(1);
});
