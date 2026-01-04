#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ORG = "standardebooks";
const booksDir = path.resolve(__dirname, "../../standardebooks-data/books");

const SKIP_FILES = new Set(["colophon.xhtml", "imprint.xhtml", "titlepage.xhtml", "uncopyright.xhtml"]);

function syncBookViaGit(slug: string, forceAll = false): { downloaded: number; skipped: number } {
  const bookDir = path.join(booksDir, slug);
  const textDir = path.join(bookDir, "text");
  const imagesDir = path.join(bookDir, "images");
  const opfPath = path.join(bookDir, "content.opf");

  const needsOpf = forceAll || !fs.existsSync(opfPath);
  const existingTextFiles = fs.existsSync(textDir) ? new Set(fs.readdirSync(textDir)) : new Set<string>();
  const existingImageFiles = fs.existsSync(imagesDir) ? new Set(fs.readdirSync(imagesDir)) : new Set<string>();
  const needsText = forceAll || existingTextFiles.size === 0;
  const needsImages = forceAll || existingImageFiles.size === 0;

  if (!needsOpf && !needsText && !needsImages) {
    return { downloaded: 0, skipped: existingTextFiles.size + existingImageFiles.size + 1 };
  }

  const tempDir = path.join(booksDir, ".tmp-clone");
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }

  try {
    const repoUrl = `https://github.com/${ORG}/${slug}.git`;
    execSync(`git clone --depth 1 --filter=blob:none --sparse "${repoUrl}" "${tempDir}"`, {
      stdio: "pipe",
      timeout: 60000,
    });

    execSync("git sparse-checkout set --skip-checks src/epub/content.opf src/epub/text src/epub/images", {
      cwd: tempDir,
      stdio: "pipe",
      timeout: 30000,
    });

    fs.mkdirSync(textDir, { recursive: true });
    fs.mkdirSync(imagesDir, { recursive: true });

    let downloaded = 0;
    let skipped = 0;

    const clonedOpfPath = path.join(tempDir, "src/epub/content.opf");
    if (fs.existsSync(clonedOpfPath)) {
      if (needsOpf) {
        fs.copyFileSync(clonedOpfPath, opfPath);
        downloaded++;
      } else {
        skipped++;
      }
    }

    const clonedTextDir = path.join(tempDir, "src/epub/text");
    if (fs.existsSync(clonedTextDir)) {
      const files = fs.readdirSync(clonedTextDir).filter((f) => f.endsWith(".xhtml") && !SKIP_FILES.has(f));

      for (const file of files) {
        const destPath = path.join(textDir, file);
        if (!forceAll && existingTextFiles.has(file)) {
          skipped++;
          continue;
        }
        fs.copyFileSync(path.join(clonedTextDir, file), destPath);
        downloaded++;
      }
    }

    const clonedImagesDir = path.join(tempDir, "src/epub/images");
    if (fs.existsSync(clonedImagesDir)) {
      const imageFiles = fs.readdirSync(clonedImagesDir).filter((f) => {
        const ext = f.toLowerCase();
        return (
          ext.endsWith(".jpg") ||
          ext.endsWith(".jpeg") ||
          ext.endsWith(".png") ||
          ext.endsWith(".svg") ||
          ext.endsWith(".gif")
        );
      });

      for (const file of imageFiles) {
        const destPath = path.join(imagesDir, file);
        if (!forceAll && existingImageFiles.has(file)) {
          skipped++;
          continue;
        }
        fs.copyFileSync(path.join(clonedImagesDir, file), destPath);
        downloaded++;
      }
    }

    return { downloaded, skipped };
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes("--force");
  const syncAll = args.includes("--sync-all");
  const slug = args.find((a) => a.includes("_") && !a.startsWith("--"));
  const limitArg = args.find((a) => /^\d+$/.test(a));
  const limit = limitArg ? parseInt(limitArg) : Infinity;

  if (slug) {
    const bookDir = path.join(booksDir, slug);
    if (!fs.existsSync(bookDir)) {
      fs.mkdirSync(bookDir, { recursive: true });
    }
    console.log(`Syncing: ${slug}${forceAll ? " (force)" : ""}`);
    const { downloaded, skipped } = syncBookViaGit(slug, forceAll);
    console.log(`✓ Done - downloaded: ${downloaded}, skipped: ${skipped}`);
    return;
  }

  const dirs = fs.readdirSync(booksDir).filter((d) => fs.statSync(path.join(booksDir, d)).isDirectory());

  let booksToProcess: string[];
  if (syncAll) {
    booksToProcess = dirs;
  } else {
    booksToProcess = dirs.filter((dir) => {
      const textDir = path.join(booksDir, dir, "text");
      const opfPath = path.join(booksDir, dir, "content.opf");
      const hasText = fs.existsSync(textDir) && fs.readdirSync(textDir).length > 0;
      const hasOpf = fs.existsSync(opfPath);
      return !hasText || !hasOpf;
    });
  }

  console.log("=".repeat(60));
  console.log("SYNC STANDARD EBOOKS");
  console.log("=".repeat(60));
  console.log(`Total books: ${dirs.length}`);
  console.log(`Mode: ${syncAll ? "sync all" : "missing only"}`);
  console.log(`Force redownload: ${forceAll}`);
  console.log(`Books to process: ${booksToProcess.length}`);
  console.log(`Limit: ${limit === Infinity ? "none" : limit}`);
  console.log("=".repeat(60));

  const toProcess = booksToProcess.slice(0, limit);
  let totalFilesDownloaded = 0;
  let totalFilesSkipped = 0;
  let booksSucceeded = 0;
  let booksFailed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const bookSlug = toProcess[i];
    process.stdout.write(`\r[${i + 1}/${toProcess.length}] ${bookSlug.substring(0, 50).padEnd(50)}`);

    try {
      const { downloaded, skipped } = syncBookViaGit(bookSlug, forceAll);
      totalFilesDownloaded += downloaded;
      totalFilesSkipped += skipped;
      booksSucceeded++;
    } catch (e) {
      console.log(`\n  Error: ${e}`);
      booksFailed++;
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Books processed: ${toProcess.length}`);
  console.log(`  - succeeded: ${booksSucceeded}`);
  console.log(`  - failed: ${booksFailed}`);
  console.log(`Files: ${totalFilesDownloaded} downloaded, ${totalFilesSkipped} skipped (existing)`);
  console.log(`Books remaining: ${booksToProcess.length - toProcess.length}`);
}

main().catch(console.error);
