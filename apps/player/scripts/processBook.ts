#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { generateBook } from "./generateBook";
import { compileToJsForBook } from "./compileBookData";

const PUBLIC_DIR = path.join(__dirname, "..", "public", "books");

export async function processBook(bookPath: string, destinationDir = PUBLIC_DIR) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📖 Processing: ${bookPath}`);
  console.log(`${"=".repeat(60)}\n`);

  const bookSourcePath = path.join(bookPath);
  console.log("bookSourcePath", bookSourcePath);
  const bookName = path.basename(bookPath);
  console.log("bookName", bookName);
  const bookPublicPath = path.join(destinationDir, bookName);
  console.log("bookPublicPath", bookPublicPath);

  try {
    // Step 1: Run generate-book script
    console.log(`1️⃣  Running generate-book for ${bookName}...`);
    console.time("removeDirectory");
    // Remove existing directory if it exists
    if (fs.existsSync(bookPublicPath)) {
      fs.rmSync(bookPublicPath, { recursive: true, force: true });
    }
    console.timeEnd("removeDirectory");
    console.time("generate-book");
    await generateBook(bookSourcePath, bookPublicPath);
    console.timeEnd("generate-book");

    // Step 2: Copy book directory to public/
    console.log(`\n2️⃣  Copying ${bookName} to public directory...`);

    console.log("bookPublicPath", bookPublicPath);

    console.time("copyDirectory");
    // Copy entire directory
    copyDirectory(bookSourcePath, bookPublicPath);
    console.timeEnd("copyDirectory");
    console.log(`   ✅ Copied to ${bookPublicPath}`);

    // Step 3: Compile TypeScript files to JavaScript
    console.log(`\n3️⃣  Compiling TypeScript files for ${bookName}...`);
    console.time("compileBookData");
    compileToJsForBook(bookName, destinationDir);
    console.timeEnd("compileBookData");

    console.log(`\n✅ Successfully processed ${bookName}`);
    return { success: true };
  } catch (error) {
    console.error(`\n❌ Failed to process ${bookName}:`, error);
    return { book: bookName, error: error as Error, success: false };
  }
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

if (require.main === module) {
  const bookPath = process.argv[2];
  if (!bookPath) {
    console.error("Usage: tsx processBook.ts <bookPath>");
    process.exit(1);
  }
  processBook(bookPath).then((result) => {
    if (result.success) {
      console.log(`✅ Successfully processed ${bookPath}`);
    } else {
      console.error(`❌ Failed to process ${bookPath}:`, result.error);
    }
  });
}
