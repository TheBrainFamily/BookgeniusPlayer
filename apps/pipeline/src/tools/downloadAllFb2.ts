#!/usr/bin/env bun
import fs from "fs";
import path from "path";

const API_URL = "https://wolnelektury.pl/api";

interface WLBook {
  title: string;
  author: string;
  slug: string;
}

interface CollectionData {
  slug: string;
  title: string;
  books: WLBook[];
}

interface WLChildBook {
  slug: string;
  title: string;
  href: string;
}

interface WLBookDetails {
  title: string;
  fb2?: string;
  children?: WLChildBook[];
}

interface MultiVolumeMapping {
  [parentSlug: string]: { title: string; children: { slug: string; title: string }[] };
}

const collectionsDir = path.resolve(__dirname, "../../wolnelektury-data/collections");
const outputDir = path.resolve(__dirname, "../../wolnelektury-data/fb2");
const mappingPath = path.resolve(__dirname, "../../wolnelektury-data/multi-volume-mapping.json");

async function getBookDetails(slug: string): Promise<WLBookDetails> {
  const response = await fetch(`${API_URL}/books/${slug}/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch book details: ${response.status}`);
  }
  return response.json();
}

async function getBookDetailsFromHref(href: string): Promise<WLBookDetails> {
  const response = await fetch(href);
  if (!response.ok) {
    throw new Error(`Failed to fetch book details: ${response.status}`);
  }
  return response.json();
}

function loadMultiVolumeMapping(): MultiVolumeMapping {
  if (fs.existsSync(mappingPath)) {
    return JSON.parse(fs.readFileSync(mappingPath, "utf-8"));
  }
  return {};
}

function saveMultiVolumeMapping(mapping: MultiVolumeMapping): void {
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
}

async function downloadFb2(
  slug: string,
  multiVolumeMapping: MultiVolumeMapping,
): Promise<{ success: boolean; reason?: string; downloadedChildren?: number }> {
  const outputPath = path.join(outputDir, `${slug}.fb2`);

  if (fs.existsSync(outputPath)) {
    return { success: true, reason: "already exists" };
  }

  if (multiVolumeMapping[slug]) {
    const allChildrenExist = multiVolumeMapping[slug].children.every((child) =>
      fs.existsSync(path.join(outputDir, `${child.slug}.fb2`)),
    );
    if (allChildrenExist) {
      return { success: true, reason: "multi-volume already downloaded" };
    }
  }

  try {
    const details = await getBookDetails(slug);

    if (details.fb2) {
      const fb2Response = await fetch(details.fb2);
      if (!fb2Response.ok) {
        return { success: false, reason: `download failed: ${fb2Response.status}` };
      }

      const buffer = Buffer.from(await fb2Response.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);

      return { success: true };
    }

    if (details.children && details.children.length > 0) {
      const childrenInfo: { slug: string; title: string }[] = [];
      let downloadedCount = 0;

      for (const child of details.children) {
        const childOutputPath = path.join(outputDir, `${child.slug}.fb2`);

        if (fs.existsSync(childOutputPath)) {
          childrenInfo.push({ slug: child.slug, title: child.title });
          continue;
        }

        const childDetails = await getBookDetailsFromHref(child.href);

        if (childDetails.fb2) {
          const fb2Response = await fetch(childDetails.fb2);
          if (fb2Response.ok) {
            const buffer = Buffer.from(await fb2Response.arrayBuffer());
            fs.writeFileSync(childOutputPath, buffer);
            downloadedCount++;
          }
        }

        childrenInfo.push({ slug: child.slug, title: child.title });
      }

      multiVolumeMapping[slug] = { title: details.title, children: childrenInfo };

      return {
        success: true,
        reason: `multi-volume (${details.children.length} tomes)`,
        downloadedChildren: downloadedCount,
      };
    }

    return { success: false, reason: "no FB2 available" };
  } catch (error) {
    return { success: false, reason: String(error) };
  }
}

async function main() {
  const concurrency = parseInt(process.argv[2] || "2", 10);
  const delayMs = parseInt(process.argv[3] || "200", 10);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const collectionFiles = fs.readdirSync(collectionsDir).filter((f) => f.endsWith(".json"));

  const allBookSlugs = new Set<string>();
  for (const file of collectionFiles) {
    const collection: CollectionData = JSON.parse(
      fs.readFileSync(path.join(collectionsDir, file), "utf-8"),
    );
    for (const book of collection.books) {
      allBookSlugs.add(book.slug);
    }
  }

  const bookSlugs = Array.from(allBookSlugs);
  const multiVolumeMapping = loadMultiVolumeMapping();

  console.log("=".repeat(60));
  console.log("FB2 DOWNLOADER");
  console.log("=".repeat(60));
  console.log(`Unique books: ${bookSlugs.length}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Delay between batches: ${delayMs}ms`);
  console.log("=".repeat(60));

  let downloaded = 0;
  let skipped = 0;
  let noFb2 = 0;
  let failed = 0;
  let multiVolume = 0;
  let childrenDownloaded = 0;

  for (let i = 0; i < bookSlugs.length; i += concurrency) {
    const batch = bookSlugs.slice(i, i + concurrency);
    const batchNum = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(bookSlugs.length / concurrency);

    process.stdout.write(
      `\rBatch ${batchNum}/${totalBatches} (${i + batch.length}/${bookSlugs.length} books)...`,
    );

    const results = await Promise.all(
      batch.map((slug) => downloadFb2(slug, multiVolumeMapping).then((r) => ({ slug, ...r }))),
    );

    for (const result of results) {
      if (result.success) {
        if (
          result.reason === "already exists" ||
          result.reason === "multi-volume already downloaded"
        ) {
          skipped++;
        } else if (result.reason?.includes("multi-volume")) {
          multiVolume++;
          childrenDownloaded += result.downloadedChildren || 0;
        } else {
          downloaded++;
        }
      } else if (result.reason?.includes("no FB2")) {
        noFb2++;
      } else {
        failed++;
        console.log(`\n  ✗ ${result.slug}: ${result.reason}`);
      }
    }

    if (i + concurrency < bookSlugs.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  saveMultiVolumeMapping(multiVolumeMapping);

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Downloaded (direct): ${downloaded}`);
  console.log(`Multi-volume works: ${multiVolume} (${childrenDownloaded} children downloaded)`);
  console.log(`Skipped (already exists): ${skipped}`);
  console.log(`No FB2 available: ${noFb2}`);
  console.log(`Failed: ${failed}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Multi-volume mapping: ${mappingPath}`);
}

main().catch(console.error);
