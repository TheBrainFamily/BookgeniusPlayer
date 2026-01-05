#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { parseStringPromise } from "xml2js";

const ORG = "standardebooks";
const OPDS_URL = "https://standardebooks.org/feeds/opds/all";
const OPDS_USER = "gozdak@gmail.com";
const OPDS_PASS = "";

const outputDir = path.resolve(__dirname, "../../standardebooks-data");
const booksDir = path.join(outputDir, "books");
const indexPath = path.join(outputDir, "index.json");

const SKIP_FILES = new Set(["colophon.xhtml", "imprint.xhtml", "titlepage.xhtml", "uncopyright.xhtml"]);

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

async function fetchOpdsFeed(): Promise<string[]> {
  console.log("Fetching OPDS feed...");
  const auth = Buffer.from(`${OPDS_USER}:${OPDS_PASS}`).toString("base64");

  const response = await fetch(OPDS_URL, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/atom+xml" },
  });

  if (!response.ok) {
    throw new Error(`OPDS fetch failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parsed = await parseStringPromise(xml);

  const entries = parsed.feed?.entry || [];
  const slugs: string[] = [];

  for (const entry of entries) {
    // Extract slug from the id or link
    // ID format: https://standardebooks.org/ebooks/author/title
    const id = entry.id?.[0] || "";
    const match = id.match(/standardebooks\.org\/ebooks\/(.+)$/);
    if (match) {
      // Convert URL path to repo slug (e.g., "agatha-christie/the-secret-adversary" -> "agatha-christie_the-secret-adversary")
      const slug = match[1].replace(/\//g, "_");
      slugs.push(slug);
    }
  }

  return slugs;
}

function getLocalBooks(): Set<string> {
  if (!fs.existsSync(booksDir)) {
    return new Set();
  }
  const dirs = fs.readdirSync(booksDir).filter((d) => fs.statSync(path.join(booksDir, d)).isDirectory());
  return new Set(dirs);
}

function downloadBookViaGit(slug: string): boolean {
  const bookDir = path.join(booksDir, slug);
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

    execSync(
      "git sparse-checkout set --skip-checks src/epub/content.opf src/epub/text src/epub/images src/epub/css images/cover.jpg",
      { cwd: tempDir, stdio: "pipe", timeout: 30000 },
    );

    fs.mkdirSync(bookDir, { recursive: true });
    fs.mkdirSync(path.join(bookDir, "text"), { recursive: true });
    fs.mkdirSync(path.join(bookDir, "images"), { recursive: true });
    fs.mkdirSync(path.join(bookDir, "css"), { recursive: true });

    // Copy content.opf
    const clonedOpfPath = path.join(tempDir, "src/epub/content.opf");
    if (fs.existsSync(clonedOpfPath)) {
      fs.copyFileSync(clonedOpfPath, path.join(bookDir, "content.opf"));
    }

    // Copy text files
    const clonedTextDir = path.join(tempDir, "src/epub/text");
    if (fs.existsSync(clonedTextDir)) {
      const files = fs.readdirSync(clonedTextDir).filter((f) => f.endsWith(".xhtml") && !SKIP_FILES.has(f));
      for (const file of files) {
        fs.copyFileSync(path.join(clonedTextDir, file), path.join(bookDir, "text", file));
      }
    }

    // Copy images
    const clonedImagesDir = path.join(tempDir, "src/epub/images");
    if (fs.existsSync(clonedImagesDir)) {
      const imageFiles = fs.readdirSync(clonedImagesDir);
      for (const file of imageFiles) {
        fs.copyFileSync(path.join(clonedImagesDir, file), path.join(bookDir, "images", file));
      }
    }

    // Copy cover.jpg from images/
    const clonedCoverPath = path.join(tempDir, "images/cover.jpg");
    if (fs.existsSync(clonedCoverPath)) {
      fs.copyFileSync(clonedCoverPath, path.join(bookDir, "images", "cover.jpg"));
    }

    // Copy CSS
    const clonedCssDir = path.join(tempDir, "src/epub/css");
    if (fs.existsSync(clonedCssDir)) {
      const cssFiles = fs.readdirSync(clonedCssDir);
      for (const file of cssFiles) {
        fs.copyFileSync(path.join(clonedCssDir, file), path.join(bookDir, "css", file));
      }
    }

    // Generate metadata.json from content.opf
    const opfContent = fs.readFileSync(path.join(bookDir, "content.opf"), "utf-8");
    const metadata = parseMetadataFromOpf(opfContent, slug);
    if (metadata) {
      fs.writeFileSync(path.join(bookDir, "metadata.json"), JSON.stringify(metadata, null, 2));
    }

    return true;
  } catch (e) {
    // Clean up failed download
    if (fs.existsSync(bookDir)) {
      fs.rmSync(bookDir, { recursive: true });
    }
    throw e;
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
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

  return {
    slug: repoName,
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

function updateIndex(newBooks: BookMetadata[]) {
  let existingBooks: BookMetadata[] = [];
  if (fs.existsSync(indexPath)) {
    const existing: BookIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    existingBooks = existing.books;
  }

  const bySlug = new Map(existingBooks.map((b) => [b.slug, b]));
  for (const book of newBooks) {
    bySlug.set(book.slug, book);
  }

  const index: BookIndex = {
    books: Array.from(bySlug.values()).sort((a, b) => a.authorFileAs.localeCompare(b.authorFileAs)),
    downloadedAt: new Date().toISOString(),
  };

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  return index.books.length;
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;

  console.log("=".repeat(60));
  console.log("SYNC NEW STANDARD EBOOKS");
  console.log("=".repeat(60));

  const allSlugs = await fetchOpdsFeed();
  console.log(`Found ${allSlugs.length} books in OPDS feed`);

  const localBooks = getLocalBooks();
  console.log(`Found ${localBooks.size} books locally`);

  const missingSlugs = allSlugs.filter((slug) => !localBooks.has(slug));
  console.log(`Missing: ${missingSlugs.length} books`);

  if (missingSlugs.length === 0) {
    console.log("\nAll books are already downloaded!");
    return;
  }

  console.log(`Limit: ${limit === Infinity ? "none" : limit}`);
  console.log("=".repeat(60));

  const toDownload = missingSlugs.slice(0, limit);
  const newMetadata: BookMetadata[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < toDownload.length; i++) {
    const slug = toDownload[i];
    process.stdout.write(`\r[${i + 1}/${toDownload.length}] ${slug.substring(0, 50).padEnd(50)}`);

    try {
      downloadBookViaGit(slug);
      const metadataPath = path.join(booksDir, slug, "metadata.json");
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
        newMetadata.push(metadata);
      }
      succeeded++;
    } catch (e) {
      failed++;
      console.log(`\n  ✗ ${slug}: ${e}`);
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  // Update index with new books
  const totalInIndex = updateIndex(newMetadata);

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Downloaded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total books in index: ${totalInIndex}`);
  console.log(`Remaining to download: ${missingSlugs.length - toDownload.length}`);
}

main().catch(console.error);
