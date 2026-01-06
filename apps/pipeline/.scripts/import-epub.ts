import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { convertBook } from "../src/tools/fb2-converter/index";
import { extractInlineImages } from "./extract-inline-images";

/**
 * Import an .epub, convert to .fb2 using Calibre's ebook-convert,
 * place it under books-data/<slug>/input/<slug>.fb2, create basic folder structure,
 * then run the fb2-converter to generate rich.xml, bookText.html, and bookChapters.xml.
 */

const DEFAULT_EBOOK_CONVERT = "/Applications/calibre.app/Contents/MacOS/ebook-convert";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function runEbookConvert(bin: string, inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [inputPath, outputPath], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ebook-convert exited with code ${code}`));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(
      "Usage: tsx .scripts/import-epub.ts <path-to-epub> [--bin /path/to/ebook-convert]",
    );
    process.exit(1);
  }

  const epubPathArg = args[0];
  const epubPath = path.resolve(epubPathArg);
  if (!fs.existsSync(epubPath)) {
    console.error(`File not found: ${epubPath}`);
    process.exit(1);
  }
  if (path.extname(epubPath).toLowerCase() !== ".epub") {
    console.error("Input must be an .epub file");
    process.exit(1);
  }

  // Optional override for ebook-convert binary
  const binFlagIndex = args.indexOf("--bin");
  const ebookConvertBin =
    binFlagIndex !== -1 && args[binFlagIndex + 1]
      ? args[binFlagIndex + 1]
      : process.env.EBOOK_CONVERT_BIN || DEFAULT_EBOOK_CONVERT;

  const baseName = path.basename(epubPath, path.extname(epubPath));
  const slug = slugify(baseName);

  const bookRoot = path.join("books-data", slug);
  const inputDir = path.join(bookRoot, "input");
  const outputDir = path.join(bookRoot, "output");
  const tempOutputDir = path.join(bookRoot, "temporary-output");

  ensureDir(inputDir);
  ensureDir(outputDir);
  ensureDir(tempOutputDir);

  const fb2Target = path.join(inputDir, `${slug}.fb2`);

  // Run Calibre conversion to FB2
  if (!fs.existsSync(ebookConvertBin)) {
    console.error(
      `ebook-convert not found at "${ebookConvertBin}".\n` +
        `Install Calibre or provide the binary via --bin or EBOOK_CONVERT_BIN.`,
    );
    process.exit(1);
  }

  console.log(`Converting to FB2 with: ${ebookConvertBin}`);
  console.log(`Input:  ${epubPath}`);
  console.log(`Output: ${fb2Target}`);
  await runEbookConvert(ebookConvertBin as string, epubPath, fb2Target);

  if (!fs.existsSync(fb2Target)) {
    console.error(`FB2 conversion did not produce expected file: ${fb2Target}`);
    process.exit(1);
  }

  // Run the existing fb2 converter to generate files inside input/
  console.log(`\nRunning FB2 converter for slug: ${slug}`);
  convertBook(slug, 0, 0);

  // Extract inline base64 images to assets/ and rewrite rich.xml links
  console.log("Extracting inline images to assets/ and updating rich.xml...");
  await extractInlineImages({ slug });

  console.log("\nDone. Generated files:");
  console.log(`- ${path.join(inputDir, "bookText.html")}`);
  console.log(`- ${path.join(inputDir, "bookChapters.xml")}`);
  console.log(`- ${path.join(inputDir, "rich.xml")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
