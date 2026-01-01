#!/usr/bin/env bun
import fs from "fs";
import path from "path";

const WORDS_PER_MINUTE = 250;

interface MultiVolumeMapping {
  [parentSlug: string]: { title: string; children: { slug: string; title: string }[] };
}

interface ReadingTimeData {
  slug: string;
  title?: string;
  wordCount: number;
  readingTimeMinutes: number;
  readingTimeFormatted: string;
  isMultiVolume: boolean;
  children?: { slug: string; title: string; wordCount: number }[];
}

const fb2Dir = path.resolve(__dirname, "../../wolnelektury-data/fb2");
const mappingPath = path.resolve(__dirname, "../../wolnelektury-data/multi-volume-mapping.json");
const outputPath = path.resolve(__dirname, "../../wolnelektury-data/reading-times.json");

function extractTextFromFb2(fb2Content: string): string {
  const bodyMatch = fb2Content.match(/<body[^>]*>([\s\S]*?)<\/body>/gi);
  if (!bodyMatch) return "";

  let text = bodyMatch.join(" ");

  text = text
    .replace(/<binary[^>]*>[\s\S]*?<\/binary>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

function formatReadingTime(minutes: number): string {
  if (minutes < 30) {
    return "<30 min";
  }
  if (minutes < 60) {
    return "~1 godz";
  }
  const hours = Math.round(minutes / 60);
  return `~${hours} godz`;
}

function getWordCountForSlug(slug: string): number {
  const fb2Path = path.join(fb2Dir, `${slug}.fb2`);
  if (!fs.existsSync(fb2Path)) {
    return 0;
  }

  const content = fs.readFileSync(fb2Path, "utf-8");
  const text = extractTextFromFb2(content);
  return countWords(text);
}

async function main() {
  const multiVolumeMapping: MultiVolumeMapping = fs.existsSync(mappingPath)
    ? JSON.parse(fs.readFileSync(mappingPath, "utf-8"))
    : {};

  const fb2Files = fs.readdirSync(fb2Dir).filter((f) => f.endsWith(".fb2"));
  const processedSlugs = new Set<string>();
  const results: { [slug: string]: ReadingTimeData } = {};

  console.log("=".repeat(60));
  console.log("READING TIME CALCULATOR");
  console.log("=".repeat(60));
  console.log(`FB2 files: ${fb2Files.length}`);
  console.log(`Multi-volume works: ${Object.keys(multiVolumeMapping).length}`);
  console.log("=".repeat(60));

  let processed = 0;
  const total = fb2Files.length + Object.keys(multiVolumeMapping).length;

  for (const [parentSlug, data] of Object.entries(multiVolumeMapping)) {
    let totalWordCount = 0;
    const childrenData: { slug: string; title: string; wordCount: number }[] = [];

    for (const child of data.children) {
      const wordCount = getWordCountForSlug(child.slug);
      totalWordCount += wordCount;
      childrenData.push({ slug: child.slug, title: child.title, wordCount });
      processedSlugs.add(child.slug);
    }

    const readingTimeMinutes = Math.ceil(totalWordCount / WORDS_PER_MINUTE);

    results[parentSlug] = {
      slug: parentSlug,
      title: data.title,
      wordCount: totalWordCount,
      readingTimeMinutes,
      readingTimeFormatted: formatReadingTime(readingTimeMinutes),
      isMultiVolume: true,
      children: childrenData,
    };

    processedSlugs.add(parentSlug);
    processed++;

    if (processed % 50 === 0) {
      process.stdout.write(`\rProcessed ${processed}/${total}...`);
    }
  }

  for (const file of fb2Files) {
    const slug = file.replace(".fb2", "");

    if (processedSlugs.has(slug)) {
      processed++;
      continue;
    }

    const wordCount = getWordCountForSlug(slug);
    const readingTimeMinutes = Math.ceil(wordCount / WORDS_PER_MINUTE);

    results[slug] = {
      slug,
      wordCount,
      readingTimeMinutes,
      readingTimeFormatted: formatReadingTime(readingTimeMinutes),
      isMultiVolume: false,
    };

    processed++;

    if (processed % 100 === 0) {
      process.stdout.write(`\rProcessed ${processed}/${total}...`);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  const allTimes = Object.values(results);
  const totalWords = allTimes.reduce((sum, r) => sum + r.wordCount, 0);
  const avgMinutes = Math.round(allTimes.reduce((sum, r) => sum + r.readingTimeMinutes, 0) / allTimes.length);
  const maxBook = allTimes.reduce((max, r) => (r.readingTimeMinutes > max.readingTimeMinutes ? r : max));
  const minBook = allTimes
    .filter((r) => r.wordCount > 0)
    .reduce((min, r) => (r.readingTimeMinutes < min.readingTimeMinutes ? r : min));

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Books processed: ${allTimes.length}`);
  console.log(`Total words: ${totalWords.toLocaleString()}`);
  console.log(`Average reading time: ${formatReadingTime(avgMinutes)}`);
  console.log(`Longest: ${maxBook.title || maxBook.slug} (${maxBook.readingTimeFormatted})`);
  console.log(`Shortest: ${minBook.title || minBook.slug} (${minBook.readingTimeFormatted})`);
  console.log(`Output: ${outputPath}`);
}

main().catch(console.error);
