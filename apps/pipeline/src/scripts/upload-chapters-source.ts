import fs from "fs";
import path from "path";
import { convex } from "../server/convex-client";
import { AdminConvexHttpClient } from "../lib/AdminConvexHttpClient";
import { api } from "@bookgenius/convex/_generated/api";
import { getChapterTitle } from "src/tools/new-tooling/get-chapter-title";
import { ensureDomParser } from "../lib/domParser";
import { computeParagraphCount } from "../lib/paragraphCount";

type CliArgs = {
  bookSlug: string;
  inputPath: string;
  only?: string;
  basename?: string;
  dryRun: boolean;
  allowNew: boolean;
};

export type UploadChaptersSourceArgs = {
  bookSlug: string;
  inputPath: string;
  only?: string;
  onlyBasenames?: string[];
  basename?: string;
  dryRun?: boolean;
  allowNew?: boolean;
};

export type UploadChaptersSourceStats = {
  uploaded: number;
  skipped: number;
  missing: number;
  total: number;
};

function resolvePath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", inputPath.slice(2));
  }
  return path.resolve(inputPath);
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: bun apps/pipeline/src/scripts/upload-chapters-source.ts <book-slug> <file-or-dir> [--only <basename>] [--basename <basename>] [--dry-run] [--allow-new]",
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
  }

  const xmlFiles = fs
    .readdirSync(inputDir)
    .filter((f) => f.match(/^rewritten-paragraphs-for-chapter-\d+\.xml$/));
  if (xmlFiles.length >= 1) {
    return xmlFiles;
  }

  throw new Error(`No .html or .xml files found in ${inputDir}`);
}

function toOnlySet(args: { only?: string; onlyBasenames?: string[] }): Set<string> | null {
  const values: string[] = [];
  if (args.only) {
    values.push(args.only);
  }
  if (args.onlyBasenames && args.onlyBasenames.length > 0) {
    values.push(...args.onlyBasenames);
  }
  if (values.length === 0) {
    return null;
  }

  return new Set(values);
}

export function shouldUploadBasename(basename: string, onlySet: Set<string> | null): boolean {
  if (!onlySet) {
    return true;
  }
  return onlySet.has(basename);
}

export async function uploadChaptersSource(
  args: UploadChaptersSourceArgs,
): Promise<UploadChaptersSourceStats> {
  const { bookSlug, basename } = args;
  const inputPath = resolvePath(args.inputPath);
  const dryRun = Boolean(args.dryRun);
  const allowNew = Boolean(args.allowNew);
  const onlySet = toOnlySet(args);
  const folderPath = `books/${bookSlug}/chapters-source`;
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    throw new Error("Missing CONVEX_URL environment variable");
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Path not found: ${inputPath}`);
  }

  const adminClient = new AdminConvexHttpClient(convexUrl);
  const stats: UploadChaptersSourceStats = { uploaded: 0, skipped: 0, missing: 0, total: 0 };

  const stat = fs.statSync(inputPath);
  const files = stat.isDirectory()
    ? listHtmlFiles(inputPath).map((file) => ({
        source: path.join(inputPath, file),
        basename: mapFilenameToBasename(file),
      }))
    : [{ source: inputPath, basename: basename ?? path.basename(inputPath) }];

  if (files.length === 0) {
    console.log("No .html files found to upload.");
    return stats;
  }

  console.log(`Found ${files.length} file(s) to upload to ${folderPath}`);
  if (dryRun) {
    console.log("Dry run enabled: no uploads will be performed.");
  }

  for (const file of files) {
    stats.total += 1;

    if (!shouldUploadBasename(file.basename, onlySet)) {
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

  return stats;
}

async function main() {
  const { bookSlug, inputPath, only, basename, dryRun, allowNew } = parseArgs();
  const stats = await uploadChaptersSource({
    bookSlug,
    inputPath,
    only,
    basename,
    dryRun,
    allowNew,
  });
  console.log(
    `Done. Uploaded: ${stats.uploaded}, skipped: ${stats.skipped}, missing: ${stats.missing}, total: ${stats.total}`,
  );
}

function parseChapterIntoDom(chapter: string): Element {
  ensureDomParser();
  const parser = new DOMParser();
  const doc = parser.parseFromString(chapter, "text/html");
  return doc.documentElement;
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
