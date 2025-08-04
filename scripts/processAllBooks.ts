#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const PUBLIC_BOOKS_DIR = path.join(__dirname, "..", "public_books");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

async function processAllBooks() {
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

  for (const bookName of bookDirs) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📖 Processing: ${bookName}`);
    console.log(`${"=".repeat(60)}\n`);

    const bookSourcePath = path.join(PUBLIC_BOOKS_DIR, bookName);
    const bookPublicPath = path.join(PUBLIC_DIR, bookName);

    try {
      // Step 1: Run generate-book script
      console.log(`1️⃣  Running generate-book for ${bookName}...`);
      execSync(`pnpm generate-book ${bookSourcePath}`, { stdio: "inherit", cwd: path.join(__dirname, "..") });

      // Step 2: Copy book directory to public/
      console.log(`\n2️⃣  Copying ${bookName} to public directory...`);

      // Remove existing directory if it exists
      if (fs.existsSync(bookPublicPath)) {
        fs.rmSync(bookPublicPath, { recursive: true, force: true });
      }

      // Copy entire directory
      copyDirectory(bookSourcePath, bookPublicPath);
      console.log(`   ✅ Copied to ${bookPublicPath}`);

      // Step 3: Compile TypeScript files to JavaScript
      console.log(`\n3️⃣  Compiling TypeScript files for ${bookName}...`);
      execSync(`node scripts/compileBookData.js ${bookName}`, { stdio: "inherit", cwd: path.join(__dirname, "..") });

      console.log(`\n✅ Successfully processed ${bookName}`);
      successCount++;
    } catch (error) {
      console.error(`\n❌ Failed to process ${bookName}:`, error);
      failCount++;
      errors.push({ book: bookName, error: error as Error });
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

function copyDirectory(src: string, dest: string) {
  // Create destination directory
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy subdirectories
      copyDirectory(srcPath, destPath);
    } else {
      // Copy file
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Run the script
processAllBooks().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
