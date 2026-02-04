import fs from "fs";
import path from "path";
import { convex } from "../server/convex-client";
import { AdminConvexHttpClient } from "../lib/AdminConvexHttpClient";
import { api } from "@bookgenius/convex/_generated/api";
import { getChapterTitle } from "src/tools/new-tooling/get-chapter-title";
import { DOMParser, type Element as XMLElement } from "@xmldom/xmldom";
import { computeParagraphCount } from "../lib/paragraphCount";

type Args = {
  bookSlug: string;
  inputPath: string;
  only?: string;
  basename?: string;
  dryRun: boolean;
  allowNew: boolean;
};

function resolvePath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", inputPath.slice(2));
  }
  return path.resolve(inputPath);
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: bun apps/pipeline/src/server/upload-chapters-source.ts <book-slug> <file-or-dir> [--only <basename>] [--basename <basename>] [--dry-run] [--allow-new]",
    );
    process.exit(1);
  }

  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx !== -1 ? args[onlyIdx + 1] : undefined;
  const basenameIdx = args.indexOf("--basename");
  const basename = basenameIdx !== -1 ? args[basenameIdx + 1] : undefined;

  return {
    bookSlug: args[0],
    inputPath: resolvePath(args[1]),
    only,
    basename,
    dryRun: args.includes("--dry-run"),
    allowNew: args.includes("--allow-new"),
  };
}

function detectContentType(filePath: string): string {
  return filePath.toLowerCase().endsWith(".html") ? "text/html" : "application/octet-stream";
}

function listHtmlFiles(inputDir: string): string[] {
  const htmlFiles = fs.readdirSync(inputDir).filter((file) => file.toLowerCase().endsWith(".html"));
  if (htmlFiles.length >= 1) {
    return htmlFiles;
  } else {
    const xmlFiles = fs
      .readdirSync(inputDir)
      .filter((f) => f.match(/^rewritten-paragraphs-for-chapter-\d+\.xml$/));
    if (xmlFiles.length >= 1) {
      return xmlFiles;
    } else {
      console.error(`No .html or .xml files found in ${inputDir}`);
      process.exit(1);
    }
  }
}

async function main() {
  const { bookSlug, inputPath, only, basename, dryRun, allowNew } = parseArgs();
  const folderPath = `books/${bookSlug}/chapters-source`;
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    console.error("Missing CONVEX_URL environment variable");
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Path not found: ${inputPath}`);
    process.exit(1);
  }

  const adminClient = new AdminConvexHttpClient(convexUrl);
  const stats = { uploaded: 0, skipped: 0, missing: 0, total: 0 };

  const stat = fs.statSync(inputPath);
  const files = stat.isDirectory()
    ? listHtmlFiles(inputPath).map((file) => ({
        source: path.join(inputPath, file),
        basename: mapFilenameToBasename(file),
      }))
    : [{ source: inputPath, basename: basename ?? path.basename(inputPath) }];

  if (files.length === 0) {
    console.log("No .html files found to upload.");
    return;
  }

  console.log(`Found ${files.length} file(s) to upload to ${folderPath}`);
  if (dryRun) {
    console.log("Dry run enabled: no uploads will be performed.");
  }

  for (const file of files) {
    stats.total += 1;

    if (only && file.basename !== only) {
      stats.skipped += 1;
      continue;
    }

    if (!allowNew) {
      const existing = await adminClient.query(api.cli.getAsset, {
        folderPath,
        basename: file.basename,
      });
      if (!existing) {
        console.error(`Missing asset in Convex: ${folderPath}/${file.basename}`);
        stats.missing += 1;
        continue;
      }
    }

    if (dryRun) {
      console.log(`[dry-run] Would upload ${file.source} -> ${folderPath}/${file.basename}`);
      continue;
    }

    const content = fs.readFileSync(file.source);
    const paragraphCount = computeParagraphCount(content.toString("utf-8"));
    try {
      await convex.uploadFile({
        folderPath,
        basename: file.basename,
        content,
        contentType: detectContentType(file.source),
      });
      const bookPath = `books/${bookSlug}`;
      await convex.updateChapterMetadata({
        bookPath,
        folderPath: `${bookPath}/chapters-source`,
        basename: file.basename,
        chapterNumber: parseInt(file.basename.split("-")[1], 10),
        title: getChapterTitle(parseChapterIntoDom(content.toString("utf-8"))),
        paragraphCount,
        sourceFormat: "html",
      });
      console.log(`Uploaded ${file.basename}`);
      stats.uploaded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to upload ${file.basename}: ${message}`);
    }
  }

  console.log(
    `Done. Uploaded: ${stats.uploaded}, skipped: ${stats.skipped}, missing: ${stats.missing}, total: ${stats.total}`,
  );
}

function parseChapterIntoDom(chapter: string): XMLElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(chapter, "text/html");
  const root = doc.documentElement as XMLElement;
  return root;
}

export function mapFilenameToBasename(filename: string): string {
  const match = filename.match(/^rewritten-paragraphs-for-chapter-(\d+)\.xml$/);
  if (match) {
    return `chapter-${match[1]}.html`;
  } else {
    const match = filename.match(/^chapter-(\d+)\.html$/);
    if (match) {
      return `chapter-${match[1]}.html`;
    } else {
      throw new Error(`Invalid filename: ${filename}`);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
