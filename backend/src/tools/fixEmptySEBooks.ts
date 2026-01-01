#!/usr/bin/env bun
import fs from "fs";
import path from "path";

const GITHUB_API = "https://api.github.com";
const ORG = "standardebooks";

const booksDir = path.resolve(__dirname, "../../standardebooks-data/books");

async function fetchFileContent(repoName: string, filePath: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${ORG}/${repoName}/master/${filePath}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.text();
}

async function listDirectory(repoName: string, dirPath: string): Promise<string[]> {
  const url = `${GITHUB_API}/repos/${ORG}/${repoName}/contents/${dirPath}`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "BookGenius-Downloader" },
  });
  if (!response.ok) {
    if (response.status === 403) {
      const resetHeader = response.headers.get("X-RateLimit-Reset");
      const waitTime = resetHeader ? Math.max(0, parseInt(resetHeader) * 1000 - Date.now()) : 60000;
      console.log(`Rate limited. Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise((r) => setTimeout(r, waitTime + 1000));
      return listDirectory(repoName, dirPath);
    }
    if (response.status === 404) return [];
    throw new Error(`listDirectory failed: ${response.status}`);
  }
  const data = (await response.json()) as { name: string; type: string }[];
  return data.filter((f) => f.type === "file").map((f) => f.name);
}

async function fixBook(slug: string): Promise<boolean> {
  const bookDir = path.join(booksDir, slug);
  const textDir = path.join(bookDir, "text");

  fs.mkdirSync(textDir, { recursive: true });

  const textFiles = await listDirectory(slug, "src/epub/text");
  const chapterFiles = textFiles.filter(
    (f) =>
      f.endsWith(".xhtml") && !["colophon.xhtml", "imprint.xhtml", "titlepage.xhtml", "uncopyright.xhtml"].includes(f),
  );

  if (chapterFiles.length === 0) {
    console.log(`  No chapters found for ${slug}`);
    return false;
  }

  let downloaded = 0;
  for (const file of chapterFiles) {
    const content = await fetchFileContent(slug, `src/epub/text/${file}`);
    if (content) {
      fs.writeFileSync(path.join(textDir, file), content);
      downloaded++;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`  Downloaded ${downloaded}/${chapterFiles.length} chapters`);
  return downloaded > 0;
}

async function main() {
  const arg = process.argv[2];

  if (arg && arg.includes("_")) {
    const slug = arg;
    const bookDir = path.join(booksDir, slug);
    if (!fs.existsSync(bookDir)) {
      console.error(`Book not found: ${slug}`);
      process.exit(1);
    }
    console.log(`Downloading: ${slug}`);
    const success = await fixBook(slug);
    console.log(success ? "✓ Done" : "✗ Failed");
    return;
  }

  const limit = parseInt(arg || "0") || Infinity;

  const dirs = fs.readdirSync(booksDir).filter((d) => fs.statSync(path.join(booksDir, d)).isDirectory());

  const emptyBooks: string[] = [];
  for (const dir of dirs) {
    const textDir = path.join(booksDir, dir, "text");
    const files = fs.existsSync(textDir) ? fs.readdirSync(textDir) : [];
    if (files.length === 0) {
      emptyBooks.push(dir);
    }
  }

  console.log("=".repeat(60));
  console.log("FIX EMPTY STANDARD EBOOKS");
  console.log("=".repeat(60));
  console.log(`Total books: ${dirs.length}`);
  console.log(`Books with empty text: ${emptyBooks.length}`);
  console.log(`Will process: ${Math.min(emptyBooks.length, limit)}`);
  console.log("=".repeat(60));

  const toProcess = emptyBooks.slice(0, limit);
  let fixed = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const slug = toProcess[i];
    process.stdout.write(`\r[${i + 1}/${toProcess.length}] ${slug.substring(0, 50).padEnd(50)}`);

    try {
      const success = await fixBook(slug);
      if (success) fixed++;
      else failed++;
    } catch (e) {
      console.log(`\n  Error: ${e}`);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Fixed: ${fixed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Remaining: ${emptyBooks.length - toProcess.length}`);
}

main().catch(console.error);
