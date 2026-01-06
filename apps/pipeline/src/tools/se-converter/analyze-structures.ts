#!/usr/bin/env bun
import fs from "fs";
import path from "path";

const booksDir = path.resolve(__dirname, "../../../standardebooks-data/books");

interface FileStructure {
  filename: string;
  topLevelTag: string;
  topLevelEpubType: string;
  nestedSectionCount: number;
  nestedSectionTypes: string[];
  headingLevels: string[];
  hasParagraphs: boolean;
}

interface BookStructure {
  slug: string;
  fileCount: number;
  hasContentOpf: boolean;
  files: FileStructure[];
  uniqueEpubTypes: Set<string>;
  uniqueNestedTypes: Set<string>;
}

function extractStructure(content: string, filename: string): FileStructure {
  const topLevelMatch = content.match(/<(article|section)[^>]*epub:type="([^"]*)"/);
  const topLevelTag = topLevelMatch?.[1] || "unknown";
  const topLevelEpubType = topLevelMatch?.[2] || "none";

  const nestedSectionMatches = [...content.matchAll(/<section[^>]*epub:type="([^"]*)"/g)];
  const nestedSectionTypes = nestedSectionMatches
    .map((m) => m[1])
    .filter((t) => t !== topLevelEpubType);

  const headingMatches = [...content.matchAll(/<(h[1-6])[^>]*>/g)];
  const headingLevels = [...new Set(headingMatches.map((m) => m[1]))];

  const hasParagraphs = (content.match(/<p[^>]*>/g) || []).some(
    (p) => !p.includes('epub:type="title"') && !p.includes('data-epub-type="title"'),
  );

  return {
    filename,
    topLevelTag,
    topLevelEpubType,
    nestedSectionCount: nestedSectionMatches.length,
    nestedSectionTypes: [...new Set(nestedSectionTypes)],
    headingLevels,
    hasParagraphs,
  };
}

function analyzeBook(slug: string): BookStructure | null {
  const bookDir = path.join(booksDir, slug);
  const textDir = path.join(bookDir, "text");

  if (!fs.existsSync(textDir)) return null;

  const hasContentOpf = fs.existsSync(path.join(bookDir, "content.opf"));
  const files = fs.readdirSync(textDir).filter((f) => f.endsWith(".xhtml"));

  const fileStructures: FileStructure[] = [];
  const uniqueEpubTypes = new Set<string>();
  const uniqueNestedTypes = new Set<string>();

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(textDir, file), "utf-8");
      const structure = extractStructure(content, file);
      fileStructures.push(structure);

      uniqueEpubTypes.add(structure.topLevelEpubType);
      structure.nestedSectionTypes.forEach((t) => uniqueNestedTypes.add(t));
    } catch {}
  }

  return {
    slug,
    fileCount: files.length,
    hasContentOpf,
    files: fileStructures,
    uniqueEpubTypes,
    uniqueNestedTypes,
  };
}

interface Anomaly {
  slug: string;
  type: string;
  details: string;
}

function detectAnomalies(book: BookStructure): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (!book.hasContentOpf) {
    anomalies.push({ slug: book.slug, type: "MISSING_OPF", details: "No content.opf file" });
  }

  if (book.fileCount === 0) {
    anomalies.push({ slug: book.slug, type: "NO_FILES", details: "No xhtml files in text/" });
  }

  const hasNestedChapters = book.files.some((f) => f.nestedSectionTypes.includes("chapter"));
  if (hasNestedChapters) {
    const filesWithNested = book.files.filter((f) => f.nestedSectionTypes.includes("chapter"));
    anomalies.push({
      slug: book.slug,
      type: "NESTED_CHAPTERS",
      details: `${filesWithNested.length} files with nested epub:type="chapter": ${filesWithNested.map((f) => f.filename).join(", ")}`,
    });
  }

  const hasSubchapters = book.uniqueNestedTypes.has("z3998:subchapter");
  if (hasSubchapters) {
    const filesWithSubchapters = book.files.filter((f) =>
      f.nestedSectionTypes.includes("z3998:subchapter"),
    );
    anomalies.push({
      slug: book.slug,
      type: "HAS_SUBCHAPTERS",
      details: `${filesWithSubchapters.length} files with z3998:subchapter`,
    });
  }

  const unusualTypes = [...book.uniqueEpubTypes].filter(
    (t) =>
      !["chapter", "part", "se:short-story", "bodymatter", "none", "z3998:fiction"].includes(t) &&
      !t.includes("bodymatter"),
  );
  if (unusualTypes.length > 0) {
    anomalies.push({
      slug: book.slug,
      type: "UNUSUAL_EPUB_TYPES",
      details: `Top-level types: ${unusualTypes.join(", ")}`,
    });
  }

  const unusualNestedTypes = [...book.uniqueNestedTypes].filter(
    (t) => !["chapter", "z3998:subchapter", "epigraph", "dedication"].includes(t),
  );
  if (unusualNestedTypes.length > 0) {
    anomalies.push({
      slug: book.slug,
      type: "UNUSUAL_NESTED_TYPES",
      details: `Nested section types: ${unusualNestedTypes.join(", ")}`,
    });
  }

  const hasArticles = book.files.some((f) => f.topLevelTag === "article");
  const hasSections = book.files.some((f) => f.topLevelTag === "section");
  if (hasArticles && hasSections) {
    anomalies.push({
      slug: book.slug,
      type: "MIXED_CONTAINERS",
      details: "Book uses both <article> and <section> as top-level containers",
    });
  }

  const partFiles = book.files.filter((f) => f.topLevelEpubType === "part");
  const partFilesWithContent = partFiles.filter((f) => f.hasParagraphs);
  if (partFilesWithContent.length > 0) {
    anomalies.push({
      slug: book.slug,
      type: "PART_WITH_CONTENT",
      details: `Part dividers with paragraph content: ${partFilesWithContent.map((f) => f.filename).join(", ")}`,
    });
  }

  const deepNesting = book.files.filter((f) => f.nestedSectionCount > 5);
  if (deepNesting.length > 0) {
    anomalies.push({
      slug: book.slug,
      type: "DEEP_NESTING",
      details: `Files with >5 nested sections: ${deepNesting.map((f) => `${f.filename}(${f.nestedSectionCount})`).join(", ")}`,
    });
  }

  return anomalies;
}

async function main() {
  const limit = parseInt(process.argv[2] || "0") || Infinity;
  const filterType = process.argv[3];

  console.log("=".repeat(80));
  console.log("STANDARD EBOOKS STRUCTURE ANALYZER");
  console.log("=".repeat(80));

  const dirs = fs.readdirSync(booksDir).filter((d) => {
    const stat = fs.statSync(path.join(booksDir, d));
    return stat.isDirectory() && d.includes("_");
  });

  console.log(`Found ${dirs.length} books`);
  console.log(`Analyzing: ${Math.min(dirs.length, limit)}`);
  console.log("=".repeat(80));

  const allAnomalies: Anomaly[] = [];
  const typeCounts: Record<string, number> = {};
  const nestedTypeCounts: Record<string, number> = {};

  const toProcess = dirs.slice(0, limit);

  for (const slug of toProcess) {
    const book = analyzeBook(slug);
    if (!book) continue;

    book.uniqueEpubTypes.forEach((t) => {
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    book.uniqueNestedTypes.forEach((t) => {
      nestedTypeCounts[t] = (nestedTypeCounts[t] || 0) + 1;
    });

    const anomalies = detectAnomalies(book);
    allAnomalies.push(...anomalies);
  }

  console.log("\n📊 EPUB TYPE DISTRIBUTION (top-level)");
  console.log("-".repeat(40));
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

  console.log("\n📊 NESTED SECTION TYPE DISTRIBUTION");
  console.log("-".repeat(40));
  Object.entries(nestedTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

  const anomalyTypes = [...new Set(allAnomalies.map((a) => a.type))];

  console.log("\n⚠️  ANOMALY SUMMARY");
  console.log("-".repeat(40));
  for (const type of anomalyTypes) {
    const count = allAnomalies.filter((a) => a.type === type).length;
    console.log(`  ${type}: ${count} books`);
  }

  if (filterType) {
    console.log(`\n🔍 DETAILS FOR: ${filterType}`);
    console.log("-".repeat(40));
    allAnomalies
      .filter((a) => a.type === filterType)
      .slice(0, 20)
      .forEach((a) => {
        console.log(`  ${a.slug}`);
        console.log(`    ${a.details}`);
      });
  } else {
    console.log("\n🔍 ANOMALY DETAILS (first 5 of each type)");
    console.log("-".repeat(40));
    for (const type of anomalyTypes) {
      console.log(`\n${type}:`);
      allAnomalies
        .filter((a) => a.type === type)
        .slice(0, 5)
        .forEach((a) => {
          console.log(`  ${a.slug}: ${a.details}`);
        });
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`Total anomalies: ${allAnomalies.length}`);
  console.log(`Unique books with anomalies: ${new Set(allAnomalies.map((a) => a.slug)).size}`);
  console.log("=".repeat(80));
  console.log("\nUsage: bun run analyze-structures.ts [limit] [filter-type]");
  console.log("Example: bun run analyze-structures.ts 100 NESTED_CHAPTERS");
}

main().catch(console.error);
