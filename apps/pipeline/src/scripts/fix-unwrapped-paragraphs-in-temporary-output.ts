#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { restoreUnwrappedBlocks } from "../tools/new-tooling/restore-unwrapped-blocks";
import { buildSectionWrapper, extractSectionInner } from "../tools/new-tooling/section-wrapper";

const DEFAULT_OUTPUT_ROOT =
  "/var/folders/j9/pbqwg7zs4336w7vccnz2xhcw0000gn/T/bookgenius-fixed-unwrapped";

type Args = { sourceRoot: string; outputRoot: string; slugs: string[] };

function resolvePath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", inputPath.slice(2));
  }
  return path.resolve(inputPath);
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  const outputIdx = args.indexOf("--out");
  const slugsIdx = args.indexOf("--slugs");

  const repoRoot = path.resolve(process.cwd());
  const defaultSource = path.join(repoRoot, "apps", "pipeline", "books-data");

  const sourceRoot = resolvePath(sourceIdx !== -1 ? args[sourceIdx + 1] : defaultSource);
  const outputRoot = resolvePath(outputIdx !== -1 ? args[outputIdx + 1] : DEFAULT_OUTPUT_ROOT);

  let slugs: string[] = [];
  if (slugsIdx !== -1) {
    slugs = args[slugsIdx + 1]?.split(",").map((slug) => slug.trim()) ?? [];
  } else {
    slugs = fs
      .readdirSync(sourceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  return { sourceRoot, outputRoot, slugs };
}

function loadOriginalHtml(tempDir: string, chapter: number): string | null {
  const directPath = path.join(tempDir, `original-paragraphs-for-chapter-${chapter}.xml`);
  if (fs.existsSync(directPath)) {
    return fs.readFileSync(directPath, "utf-8");
  }

  const prefix = `original-paragraphs-for-chapter-${chapter}-chunk-`;
  const chunkFiles = fs
    .readdirSync(tempDir)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".xml"))
    .map((file) => ({ file, index: Number(file.slice(prefix.length).replace(/\.xml$/, "")) }))
    .filter((entry) => Number.isFinite(entry.index))
    .sort((a, b) => a.index - b.index);

  if (chunkFiles.length === 0) return null;

  return chunkFiles
    .map((entry) => fs.readFileSync(path.join(tempDir, entry.file), "utf-8"))
    .join("\n");
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const { sourceRoot, outputRoot, slugs } = parseArgs();

  let totalFiles = 0;
  let changedFiles = 0;

  for (const slug of slugs) {
    const tempDir = path.join(sourceRoot, slug, "temporary-output");
    if (!fs.existsSync(tempDir)) {
      console.warn(`Skipping ${slug}: temporary-output not found`);
      continue;
    }

    const outputTempDir = path.join(outputRoot, slug, "temporary-output");
    ensureDir(outputTempDir);

    const rewrittenFiles = fs
      .readdirSync(tempDir)
      .filter((file) => /^rewritten-paragraphs-for-chapter-\d+\.xml$/.test(file));

    if (rewrittenFiles.length === 0) {
      console.warn(`Skipping ${slug}: no rewritten-paragraphs files`);
      continue;
    }

    let slugChanged = 0;

    for (const file of rewrittenFiles) {
      totalFiles += 1;
      const chapter = Number(file.match(/(\d+)/)?.[1]);
      if (!Number.isFinite(chapter)) {
        continue;
      }

      const modelRaw = fs.readFileSync(path.join(tempDir, file), "utf-8");
      const originalRaw = loadOriginalHtml(tempDir, chapter);
      if (!originalRaw) {
        console.warn(`Skipping ${slug} chapter ${chapter}: original paragraphs not found`);
        continue;
      }

      const modelExtract = extractSectionInner(modelRaw);
      const originalExtract = extractSectionInner(originalRaw);

      const fixedInner = restoreUnwrappedBlocks(originalExtract.inner, modelExtract.inner);
      const hasChanges = fixedInner !== modelExtract.inner;

      const output = hasChanges ? buildSectionWrapper(fixedInner, modelExtract.wrapper) : modelRaw;

      fs.writeFileSync(path.join(outputTempDir, file), output, "utf-8");

      if (hasChanges) {
        slugChanged += 1;
        changedFiles += 1;
      }
    }

    console.log(
      `Processed ${slug}: ${rewrittenFiles.length} chapter(s), changed ${slugChanged}. Output: ${outputTempDir}`,
    );
  }

  console.log(`Done. Processed ${totalFiles} file(s). Changed ${changedFiles}.`);
}

main();
