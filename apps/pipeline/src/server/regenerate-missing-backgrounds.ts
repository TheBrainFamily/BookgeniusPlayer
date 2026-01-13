import path from "path";
import fs from "fs";
import { convex } from "./convex-client";
import "dotenv/config";
import { setCurrentBook } from "../../src/helpers/getCurrentBook";
import { generateBackgrounds } from "../../src/tools/new-tooling/generate-prompts-for-backgrounds";

function getContentType(filename: string): string {
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

console.log(`FREE_RUN: ${process.env.FREE_RUN}`);

async function uploadBackgroundsToConvex(bookSlug: string, outputDir: string) {
  const bookPath = `books/${bookSlug}`;
  const backgroundsDir = path.join(outputDir, "backgrounds");

  if (!fs.existsSync(backgroundsDir)) {
    console.log(`No backgrounds directory found at ${backgroundsDir}`);
    return;
  }

  const files = fs.readdirSync(backgroundsDir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));

  console.log(`\n📤 Uploading ${files.length} backgrounds to Convex...`);

  for (const file of files) {
    const filePath = path.join(backgroundsDir, file);
    const content = fs.readFileSync(filePath);

    try {
      await convex.uploadFile({
        folderPath: `${bookPath}/backgrounds`,
        basename: file,
        content,
        contentType: getContentType(file),
      });

      const match = file.match(/(\d+)-(\d+)/);
      if (match) {
        const chapter = parseInt(match[1], 10);
        const paragraph = parseInt(match[2], 10);
        await convex.upsertBackgroundCue({ bookPath, chapter, paragraph, fileBasename: file });
      }

      console.log(`  ✅ ${file} uploaded`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ❌ Failed to upload ${file}: ${msg}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(
      "Usage: bun regenerate-missing-backgrounds.ts <book-slug> [--generate-only] [--upload-only]",
    );
    console.log("");
    console.log("Examples:");
    console.log("  bun regenerate-missing-backgrounds.ts a-a-milne_winnie-the-pooh");
    console.log("  bun regenerate-missing-backgrounds.ts a-a-milne_winnie-the-pooh --upload-only");
    process.exit(1);
  }

  const inputPath = args[0];
  const bookSlug = path.basename(inputPath); // Extract "a-a-milne_winnie-the-pooh" from any path
  const generateOnly = args.includes("--generate-only");
  const uploadOnly = args.includes("--upload-only");

  // setCurrentBook expects relative path like "books-data/slug"
  setCurrentBook(`books-data/${bookSlug}`);

  const outputDir = path.resolve(__dirname, `../../books-data/${bookSlug}/output`);

  if (!uploadOnly) {
    console.log(`\n🎨 Generating backgrounds for ${bookSlug}...`);
    await generateBackgrounds({ outputSubfolder: "backgrounds" });
  }

  if (!generateOnly) {
    await uploadBackgroundsToConvex(bookSlug, outputDir);
  }

  console.log("\n✅ Done!");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
