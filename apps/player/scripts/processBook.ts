#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { generateBook } from "./generateBook";
import { compileToJsForBook } from "./compileBookData";
import { buildBookFromContent } from "./buildBookFromContent";
import { createDemoBook } from "./createDemoBook";

const PUBLIC_DIR = path.join(__dirname, "..", "public", "books");

export async function processBook(bookPath: string, destinationDir = PUBLIC_DIR, isDemo = false): Promise<{ success: boolean; book?: string; error?: Error }> {
  const bookSourcePath = path.join(bookPath);
  const bookName = path.basename(bookPath);
  const outputBookName = isDemo ? `${bookName}-demo` : bookName;
  const bookPublicPath = path.join(destinationDir, outputBookName);
  const fullBookPath = path.join(destinationDir, bookName);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📖 Processing: ${bookPath}${isDemo ? " (DEMO VERSION)" : ""}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    if (isDemo) {
      // For demo books, we need the full book to be compiled first
      if (!fs.existsSync(fullBookPath) || !fs.existsSync(path.join(fullBookPath, "compiled"))) {
        throw new Error(`Full book must be compiled first. Missing: ${fullBookPath}/compiled`);
      }

      // Extract demo chapters from metadata
      const metadataPath = path.join(bookSourcePath, "booksContent", "metadata.xml");
      let demoChapters: number[] = [1]; // Default

      if (fs.existsSync(metadataPath)) {
        const metadataContent = fs.readFileSync(metadataPath, "utf8");
        const demoChaptersMatch = metadataContent.match(/<DemoChapters>([^<]+)<\/DemoChapters>/);

        if (demoChaptersMatch) {
          demoChapters = demoChaptersMatch[1].split(",").map((num) => parseInt(num.trim()));
        } else {
          // Default: 1 chapter for normal books, 2 for plays
          const formMatch = metadataContent.match(/<Form>([^<]+)<\/Form>/);
          const isPlay = formMatch && formMatch[1].toLowerCase() === "play";
          demoChapters = isPlay ? [1, 2] : [1];
        }
      }

      console.log(`📚 Creating demo book with chapters: ${demoChapters.join(", ")}`);

      // Step 1: Build filtered book.xml
      console.log(`0️⃣  Building book.xml from booksContent (demo: chapters ${demoChapters.join(", ")})...`);
      console.time("build-book-from-content");
      buildBookFromContent(bookSourcePath, true);
      console.timeEnd("build-book-from-content");

      // Step 2: Remove existing demo directory
      if (fs.existsSync(bookPublicPath)) {
        fs.rmSync(bookPublicPath, { recursive: true, force: true });
      }

      // Step 3: Create demo book with filtered data and assets
      console.log(`\n1️⃣  Creating demo book from full book data...`);
      console.time("create-demo");
      const filteredBookXml = path.join(bookSourcePath, "book.xml");
      await createDemoBook(fullBookPath, bookPublicPath, demoChapters, filteredBookXml);
      console.timeEnd("create-demo");

      // No need to compile TypeScript for demo books since we generate JS directly
    } else {
      // Regular book processing (non-demo)
      console.log(`0️⃣  Building book.xml from booksContent...`);
      console.time("build-book-from-content");
      buildBookFromContent(bookSourcePath, false);
      console.timeEnd("build-book-from-content");

      // Remove existing directory if it exists
      console.time("removeDirectory");
      if (fs.existsSync(bookPublicPath)) {
        fs.rmSync(bookPublicPath, { recursive: true, force: true });
      }
      console.timeEnd("removeDirectory");

      // Copy book directory to public/
      console.log(`\n1️⃣  Copying ${bookName} to public directory...`);
      console.time("copyDirectory");
      copyDirectory(bookSourcePath, bookPublicPath);
      console.timeEnd("copyDirectory");
      console.log(`   ✅ Copied to ${bookPublicPath}`);

      // Run generate-book script
      console.log(`\n2️⃣  Running generate-book for ${bookName}...`);
      console.time("generate-book");
      await generateBook(bookSourcePath, bookPublicPath, false);
      console.timeEnd("generate-book");

      // Compile TypeScript files to JavaScript
      console.log(`\n3️⃣  Compiling TypeScript files for ${bookName}...`);
      console.time("compileBookData");
      compileToJsForBook(bookName, destinationDir);
      console.timeEnd("compileBookData");
    }

    console.log(`\n✅ Successfully processed ${bookName}${isDemo ? " (demo)" : ""}`);
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
