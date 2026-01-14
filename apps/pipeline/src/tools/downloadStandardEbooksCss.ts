#!/usr/bin/env bun
import fs from "fs";
import path from "path";

const ORG = "standardebooks";
const booksDir = path.resolve(__dirname, "../../standardebooks-data/books");

async function fetchFileContent(repoName: string, filePath: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${ORG}/${repoName}/master/${filePath}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.text();
}

async function main() {
  console.log("=".repeat(60));
  console.log("STANDARD EBOOKS CSS DOWNLOADER");
  console.log("=".repeat(60));

  if (!fs.existsSync(booksDir)) {
    console.error(`Books directory not found: ${booksDir}`);
    process.exit(1);
  }

  const bookFolders = fs
    .readdirSync(booksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  console.log(`Found ${bookFolders.length} books\n`);

  let downloaded = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < bookFolders.length; i++) {
    const repoName = bookFolders[i];
    const cssDir = path.join(booksDir, repoName, "css");
    const cssPath = path.join(cssDir, "local.css");

    process.stdout.write(
      `\r[${i + 1}/${bookFolders.length}] ${repoName.substring(0, 50).padEnd(50)}`,
    );

    // Skip if already downloaded
    if (fs.existsSync(cssPath)) {
      skipped++;
      continue;
    }

    const css = await fetchFileContent(repoName, "src/epub/css/local.css");
    if (css) {
      fs.mkdirSync(cssDir, { recursive: true });
      fs.writeFileSync(cssPath, css);
      downloaded++;
    } else {
      failed++;
    }

    // Small delay to be nice to GitHub
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total books: ${bookFolders.length}`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Skipped (existing): ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
