#!/usr/bin/env bun
import { generateBookDescription } from "./getBookData";
import fs from "fs";
import path from "path";

interface WLBook {
  title: string;
  author: string;
  slug: string;
  epoch?: string;
  genre?: string;
  kind?: string;
}

interface CollectionData {
  slug: string;
  title: string;
  books: WLBook[];
}

const collectionsDir = path.resolve(__dirname, "../../wolnelektury-data/collections");
const outputDir = path.resolve(__dirname, "../../wolnelektury-data/generated-descriptions");

async function processCollection(
  collectionSlug: string,
): Promise<{ slug: string; success: number; failed: number }> {
  const collectionPath = path.join(collectionsDir, `${collectionSlug}.json`);
  const outputPath = path.join(outputDir, `${collectionSlug}-descriptions.json`);

  if (fs.existsSync(outputPath)) {
    console.log(`⏭ Skipping ${collectionSlug} (already exists)`);
    return { slug: collectionSlug, success: 0, failed: 0 };
  }

  const collection: CollectionData = JSON.parse(fs.readFileSync(collectionPath, "utf-8"));
  console.log(`🚀 Starting ${collectionSlug} (${collection.books.length} books)`);

  const results = await Promise.all(
    collection.books.map(async (book) => {
      try {
        const description = await generateBookDescription({
          title: book.title,
          author: book.author,
          epoch: book.epoch,
          genre: book.genre,
          kind: book.kind,
          collectionTitle: collection.title,
        });
        return {
          ...book,
          generatedDescription: description.description,
          generatedHook: description.hook,
        };
      } catch (error) {
        console.error(`  ✗ ${collectionSlug}/${book.slug}: ${error}`);
        return { ...book, generatedDescription: "", generatedHook: "" };
      }
    }),
  );

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  const success = results.filter((r) => r.generatedDescription).length;
  const failed = results.length - success;
  console.log(`✓ Finished ${collectionSlug}: ${success} success, ${failed} failed`);

  return { slug: collectionSlug, success, failed };
}

async function main() {
  const concurrency = parseInt(process.argv[2] || "5", 10);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const collectionFiles = fs.readdirSync(collectionsDir).filter((f) => f.endsWith(".json"));
  const collectionSlugs = collectionFiles.map((f) => f.replace(".json", ""));

  console.log("=".repeat(60));
  console.log("BATCH BOOK DESCRIPTION GENERATOR");
  console.log("=".repeat(60));
  console.log(`Collections: ${collectionSlugs.length}`);
  console.log(`Concurrency: ${concurrency} collections at a time`);
  console.log("=".repeat(60));

  const results: { slug: string; success: number; failed: number }[] = [];

  for (let i = 0; i < collectionSlugs.length; i += concurrency) {
    const batch = collectionSlugs.slice(i, i + concurrency);
    console.log(
      `\n--- Batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(collectionSlugs.length / concurrency)} ---`,
    );
    const batchResults = await Promise.all(batch.map((slug) => processCollection(slug)));
    results.push(...batchResults);
  }

  console.log("\n" + "=".repeat(60));
  console.log("FINAL SUMMARY");
  console.log("=".repeat(60));

  const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const skipped = results.filter((r) => r.success === 0 && r.failed === 0).length;

  console.log(`Collections processed: ${results.length - skipped}`);
  console.log(`Collections skipped: ${skipped}`);
  console.log(`Total books success: ${totalSuccess}`);
  console.log(`Total books failed: ${totalFailed}`);
}

main().catch(console.error);
