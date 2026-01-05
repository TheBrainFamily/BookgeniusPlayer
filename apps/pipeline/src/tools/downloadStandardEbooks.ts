#!/usr/bin/env bun
import fs from "fs";
import path from "path";

const GITHUB_API = "https://api.github.com";
const ORG = "standardebooks";
const PER_PAGE = 100;

const outputDir = path.resolve(__dirname, "../../standardebooks-data");
const booksDir = path.join(outputDir, "books");
const indexPath = path.join(outputDir, "index.json");

interface RepoInfo {
  name: string;
  description: string | null;
  pushed_at: string;
}

interface BookMetadata {
  slug: string;
  repoName: string;
  title: string;
  author: string;
  authorFileAs: string;
  description: string;
  longDescription: string;
  wordCount: number;
  readingEase: number;
  language: string;
  subjects: string[];
  wikipediaUrl: string | null;
  coverArtist: string | null;
  published: string | null;
}

interface BookIndex {
  books: BookMetadata[];
  downloadedAt: string;
}

const EXCLUDED_REPOS = new Set(["tools", "web", "manual", "se-lint-ignore-patterns", ".github"]);

function isBookRepo(name: string): boolean {
  if (EXCLUDED_REPOS.has(name)) return false;
  return name.includes("_");
}

async function fetchAllRepos(recentOnly: boolean = false): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [];
  let page = 1;
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  while (true) {
    let url = `${GITHUB_API}/orgs/${ORG}/repos?per_page=${PER_PAGE}&page=${page}&type=public`;
    if (recentOnly) {
      url += "&sort=pushed&direction=desc";
    }
    console.log(`Fetching repos page ${page}...`);

    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "BookGenius-Downloader" },
    });

    if (!response.ok) {
      if (response.status === 403) {
        console.log("Rate limited. Waiting 60 seconds...");
        await new Promise((r) => setTimeout(r, 60000));
        continue;
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = (await response.json()) as RepoInfo[];
    if (data.length === 0) break;

    if (recentOnly) {
      // Filter to only repos pushed in the last 2 weeks
      const recentRepos = data.filter((r) => new Date(r.pushed_at) > twoWeeksAgo);
      repos.push(...recentRepos);

      // If we found repos older than 2 weeks, stop fetching
      if (recentRepos.length < data.length) {
        console.log(`Found ${repos.length} repos pushed in the last 2 weeks`);
        break;
      }
    } else {
      repos.push(...data);
    }

    page++;
    await new Promise((r) => setTimeout(r, 100));
  }

  return repos.filter((r) => isBookRepo(r.name));
}

async function fetchFileContent(repoName: string, filePath: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${ORG}/${repoName}/master/${filePath}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.text();
}

async function fetchBinaryFile(repoName: string, filePath: string): Promise<Buffer | null> {
  const url = `https://raw.githubusercontent.com/${ORG}/${repoName}/master/${filePath}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
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
      console.log(`\n  Rate limited on listDirectory. Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise((r) => setTimeout(r, waitTime + 1000));
      return listDirectory(repoName, dirPath);
    }
    if (response.status === 404) return [];
    throw new Error(`listDirectory failed: ${response.status} for ${dirPath}`);
  }
  const data = (await response.json()) as { name: string; type: string }[];
  return data.filter((f) => f.type === "file").map((f) => f.name);
}

function parseMetadataFromOpf(opfContent: string, repoName: string): BookMetadata | null {
  const getTag = (tag: string): string => {
    const match = opfContent.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag.split(" ")[0]}>`));
    return match ? match[1].trim() : "";
  };

  const getMeta = (property: string): string => {
    const match = opfContent.match(new RegExp(`<meta[^>]*property="${property}"[^>]*>([^<]*)</meta>`));
    return match ? match[1].trim() : "";
  };

  const getMetaRefines = (id: string, property: string): string => {
    const match = opfContent.match(
      new RegExp(`<meta[^>]*refines="#${id}"[^>]*property="${property}"[^>]*>([^<]*)</meta>`),
    );
    return match ? match[1].trim() : "";
  };

  const title = getTag("dc:title");
  const author = getTag("dc:creator");
  if (!title || !author) return null;

  const authorFileAs = getMetaRefines("author", "file-as") || author;
  const description = getTag("dc:description");
  const longDescription = getMeta("se:long-description")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  const wordCount = parseInt(getMeta("se:word-count")) || 0;
  const readingEase = parseFloat(getMeta("se:reading-ease.flesch")) || 0;
  const language = getTag("dc:language");
  const wikipediaUrl = getMeta("se:url.encyclopedia.wikipedia") || null;

  const subjectMatches = opfContent.matchAll(/<dc:subject[^>]*>([^<]+)<\/dc:subject>/g);
  const subjects = Array.from(subjectMatches).map((m) => m[1]);

  const artistMatch = opfContent.match(/<dc:contributor id="artist">([^<]+)<\/dc:contributor>/);
  const coverArtist = artistMatch ? artistMatch[1] : null;

  const dateMatch = opfContent.match(/<dc:date>([^<]+)<\/dc:date>/);
  const published = dateMatch ? dateMatch[1] : null;

  const slug = repoName;

  return {
    slug,
    repoName,
    title,
    author,
    authorFileAs,
    description,
    longDescription,
    wordCount,
    readingEase,
    language,
    subjects,
    wikipediaUrl,
    coverArtist,
    published,
  };
}

async function downloadBook(repoName: string, skipExisting: boolean): Promise<BookMetadata | null> {
  const bookDir = path.join(booksDir, repoName);
  const metadataPath = path.join(bookDir, "metadata.json");

  if (skipExisting && fs.existsSync(metadataPath)) {
    const existing = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    return existing as BookMetadata;
  }

  const opfContent = await fetchFileContent(repoName, "src/epub/content.opf");
  if (!opfContent) {
    console.log(`  ✗ No content.opf found`);
    return null;
  }

  const metadata = parseMetadataFromOpf(opfContent, repoName);
  if (!metadata) {
    console.log(`  ✗ Could not parse metadata`);
    return null;
  }

  fs.mkdirSync(bookDir, { recursive: true });
  fs.mkdirSync(path.join(bookDir, "text"), { recursive: true });
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true });

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  const coverJpg = await fetchBinaryFile(repoName, "images/cover.jpg");
  if (coverJpg) {
    fs.writeFileSync(path.join(bookDir, "images", "cover.jpg"), coverJpg);
  }

  const textFiles = await listDirectory(repoName, "src/epub/text");
  const chapterFiles = textFiles.filter(
    (f) =>
      f.endsWith(".xhtml") && !["colophon.xhtml", "imprint.xhtml", "titlepage.xhtml", "uncopyright.xhtml"].includes(f),
  );

  let downloadedChapters = 0;
  for (const file of chapterFiles) {
    const content = await fetchFileContent(repoName, `src/epub/text/${file}`);
    if (content) {
      fs.writeFileSync(path.join(bookDir, "text", file), content);
      downloadedChapters++;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  if (chapterFiles.length > 0 && downloadedChapters === 0) {
    throw new Error(`Failed to download any chapters (expected ${chapterFiles.length})`);
  }

  const imageFiles = await listDirectory(repoName, "src/epub/images");
  const internalImages = imageFiles.filter((f) => !["cover.svg", "logo.svg", "titlepage.svg"].includes(f));

  for (const file of internalImages) {
    const content = await fetchBinaryFile(repoName, `src/epub/images/${file}`);
    if (content) {
      fs.writeFileSync(path.join(bookDir, "images", file), content);
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  return metadata;
}

async function main() {
  const skipExisting = process.argv.includes("--skip-existing");
  const recentOnly = process.argv.includes("--recent");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;

  fs.mkdirSync(booksDir, { recursive: true });

  console.log("=".repeat(60));
  console.log("STANDARD EBOOKS DOWNLOADER");
  console.log("=".repeat(60));
  console.log(`Skip existing: ${skipExisting}`);
  console.log(`Recent only (last 2 weeks): ${recentOnly}`);
  console.log(`Limit: ${limit === Infinity ? "none" : limit}`);
  console.log("=".repeat(60));

  console.log("\nFetching repository list...");
  const repos = await fetchAllRepos(recentOnly);
  console.log(`Found ${repos.length} book repositories`);

  const booksToProcess = repos.slice(0, limit);
  const allMetadata: BookMetadata[] = [];
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < booksToProcess.length; i++) {
    const repo = booksToProcess[i];
    process.stdout.write(`\r[${i + 1}/${booksToProcess.length}] ${repo.name.substring(0, 50).padEnd(50)}`);

    try {
      const metadata = await downloadBook(repo.name, skipExisting);
      if (metadata) {
        allMetadata.push(metadata);
        if (fs.existsSync(path.join(booksDir, repo.name, "metadata.json"))) {
          const stat = fs.statSync(path.join(booksDir, repo.name, "metadata.json"));
          if (Date.now() - stat.mtimeMs < 5000) {
            downloaded++;
          } else {
            skipped++;
          }
        }
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
      console.log(`\n  ✗ ${repo.name}: ${e}`);
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  // When using --recent, merge with existing index instead of replacing
  let finalBooks: BookMetadata[] = allMetadata;
  if (recentOnly && fs.existsSync(indexPath)) {
    const existingIndex: BookIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    const existingBySlug = new Map(existingIndex.books.map((b) => [b.slug, b]));

    // Update existing books with new metadata
    for (const book of allMetadata) {
      existingBySlug.set(book.slug, book);
    }
    finalBooks = Array.from(existingBySlug.values());
  }

  const index: BookIndex = {
    books: finalBooks.sort((a, b) => a.authorFileAs.localeCompare(b.authorFileAs)),
    downloadedAt: new Date().toISOString(),
  };
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Processed: ${allMetadata.length}`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Skipped (existing): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total books in index: ${finalBooks.length}`);
  console.log(`Index saved to: ${indexPath}`);
}

main().catch(console.error);
