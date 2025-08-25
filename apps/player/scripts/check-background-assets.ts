#!/usr/bin/env tsx

// Check background assets and cut scenes for a book using getBackgroundsForBook and getCutScenesForBook functions
// Usage: tsx check-background-assets.ts <book-name>
// Example: tsx check-background-assets.ts 1984

import { existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

interface BackgroundForBook {
  chapter: number;
  paragraph: number;
  file: string;
}

interface CutSceneForBook {
  chapter: number;
  paragraph: number;
  file: string;
  delayInMs?: number;
  text?: string;
}

interface MediaAsset {
  chapter: number;
  paragraph: number;
  file: string;
  exists: boolean;
  size?: FileSize;
  sizeCorrect: boolean;
  type: "background" | "cutscene";
}

interface FileSize {
  width: number;
  height: number;
}

function getFileDimensions(filePath: string): FileSize | null {
  try {
    const output = execSync(`ffprobe -v quiet -print_format json -show_streams "${filePath}"`, { encoding: "utf8" });
    const data = JSON.parse(output);
    const videoStream = data.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");

    if (videoStream) {
      return { width: videoStream.width, height: videoStream.height };
    }
  } catch {
    return null;
  }
  return null;
}

async function loadBackgroundsForBook(bookPath: string): Promise<BackgroundForBook[]> {
  try {
    const backgroundsPath = join(bookPath, "getBackgroundsForBook.ts");
    if (!existsSync(backgroundsPath)) {
      console.error(`❌ getBackgroundsForBook.ts not found at ${backgroundsPath}`);
      return [];
    }

    // Use dynamic import for a robust way to load the data
    const absolutePath = resolve(backgroundsPath);
    const module = await import(`file://${absolutePath}`);
    return module.getBackgroundsForBook();
  } catch (error) {
    console.error(`❌ Error loading backgrounds: ${error}`);
    return [];
  }
}

async function loadCutScenesForBook(bookPath: string): Promise<CutSceneForBook[]> {
  try {
    const cutScenesPath = join(bookPath, "getCutScenesForBook.ts");
    if (!existsSync(cutScenesPath)) {
      // This is not an error, as some books may not have cut scenes.
      return [];
    }

    // Use dynamic import for a robust way to load the data
    const absolutePath = resolve(cutScenesPath);
    const module = await import(`file://${absolutePath}`);
    return module.getCutScenesForBook();
  } catch (error) {
    console.error(`❌ Error loading cut scenes: ${error}`);
    return [];
  }
}

async function checkMediaAssets(bookPath: string): Promise<MediaAsset[]> {
  const backgrounds = await loadBackgroundsForBook(bookPath);
  const cutScenes = await loadCutScenesForBook(bookPath);
  const assetsDir = join(bookPath, "assets");

  if (!existsSync(assetsDir)) {
    console.error(`❌ Assets directory not found at ${assetsDir}`);
    return [];
  }

  const results: MediaAsset[] = [];

  // Check background assets
  for (const background of backgrounds) {
    const filePath = join(assetsDir, background.file);
    const exists = existsSync(filePath);
    let size: FileSize | undefined;
    let sizeCorrect = true;

    if (exists) {
      size = getFileDimensions(filePath) || undefined;
      if (size) {
        sizeCorrect = size.width === 1280 && size.height === 720;
      }
    }

    results.push({ chapter: background.chapter, paragraph: background.paragraph, file: background.file, exists, size, sizeCorrect, type: "background" });
  }

  // Check cut scene assets
  for (const cutScene of cutScenes) {
    const filePath = join(assetsDir, cutScene.file);
    const exists = existsSync(filePath);
    let size: FileSize | undefined;
    let sizeCorrect = true;

    if (exists) {
      size = getFileDimensions(filePath) || undefined;
      if (size) {
        // Cut scenes can have different dimensions, so we'll be more flexible
        sizeCorrect = size.width >= 1280 && size.height >= 720;
      }
    }

    results.push({ chapter: cutScene.chapter, paragraph: cutScene.paragraph, file: cutScene.file, exists, size, sizeCorrect, type: "cutscene" });
  }

  return results;
}

function findOrphanedMediaFiles(bookPath: string, expectedFiles: string[]): string[] {
  const assetsDir = join(bookPath, "assets");
  if (!existsSync(assetsDir)) {
    return [];
  }

  const allFiles = readdirSync(assetsDir);
  const mp4Files = allFiles.filter((file) => file.endsWith(".mp4"));

  // Filter out character assets and other non-media files
  const mediaFiles = mp4Files.filter((file) => {
    // Skip character assets
    if (file.includes("-speaks.mp4") || file.includes("-listens.mp4")) {
      return false;
    }

    // Skip special character assets
    if (file.includes("-fixed.mp4") || file.includes("-loop.mp4")) {
      return false;
    }

    // Include chapter-specific files and other potential media files
    return true;
  });

  // Find files that are not in the expected list
  return mediaFiles.filter((file) => !expectedFiles.includes(file));
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: tsx check-background-assets.ts <book-name>");
    console.error("Example: tsx check-background-assets.ts 1984");
    process.exit(1);
  }

  const bookPath = args[0];
  console.log(`\n\n\nChecking media assets for book: ${bookPath}`);

  checkMediaAssets(bookPath)
    .then((mediaAssets) => {
      if (mediaAssets.length === 0) {
        console.log("❌ No media assets found in getBackgroundsForBook.ts or getCutScenesForBook.ts");
        return;
      }

      const backgrounds = mediaAssets.filter((asset) => asset.type === "background");
      const cutScenes = mediaAssets.filter((asset) => asset.type === "cutscene");

      console.log(`\nBackground assets defined in getBackgroundsForBook.ts: ${backgrounds.length}`);
      console.log(`Cut scene assets defined in getCutScenesForBook.ts: ${cutScenes.length}`);
      console.log(`Total media assets: ${mediaAssets.length}`);

      // Check for missing assets
      const missing = mediaAssets.filter((asset) => !asset.exists);
      if (missing.length > 0) {
        console.log(`\n❌ Missing Media Assets: ${missing.length}`);
        missing.forEach((asset) => {
          const typeLabel = asset.type === "background" ? "Background" : "Cut Scene";
          console.log(`  ${typeLabel} - Chapter ${asset.chapter}, Paragraph ${asset.paragraph}: ${asset.file}`);
        });
      }

      // Check for dimension issues
      const dimensionIssues = mediaAssets.filter((asset) => asset.exists && asset.size && !asset.sizeCorrect);

      if (dimensionIssues.length > 0) {
        console.log(`\n⚠️  Dimension Issues: ${dimensionIssues.length}`);
        dimensionIssues.forEach((asset) => {
          if (asset.size) {
            const expected = asset.type === "background" ? "1280x720" : "1280x720 or larger";
            const typeLabel = asset.type === "background" ? "Background" : "Cut Scene";
            console.log(`  ${typeLabel} - ${asset.file}: ${asset.size.width}x${asset.size.height} (expected ${expected})`);
          }
        });
      }

      // Check for orphaned media files
      const expectedFiles = mediaAssets.map((asset) => asset.file);
      const orphanedFiles = findOrphanedMediaFiles(bookPath, expectedFiles);

      if (orphanedFiles.length > 0) {
        console.log(`\n🔍 Orphaned Media Files: ${orphanedFiles.length}`);
        orphanedFiles.forEach((file) => {
          const filePath = join(bookPath, "assets", file);
          const size = getFileDimensions(filePath) || undefined;
          const sizeInfo = size ? ` (${size.width}x${size.height})` : "";
          console.log(`  ${file}${sizeInfo}`);
        });
      }

      // Summary
      const totalIssues = missing.length + dimensionIssues.length + orphanedFiles.length;
      if (totalIssues === 0) {
        console.log("\n✅ All media assets are present and properly sized!");
      } else {
        console.log(`\n📊 Summary: ${missing.length} missing assets, ${dimensionIssues.length} dimension issues, ${orphanedFiles.length} orphaned files`);
      }

      // Show successful assets
      const successful = mediaAssets.filter((asset) => asset.exists && asset.size && asset.sizeCorrect);
      if (successful.length > 0) {
        const successfulBackgrounds = successful.filter((asset) => asset.type === "background").length;
        const successfulCutScenes = successful.filter((asset) => asset.type === "cutscene").length;
        console.log(`\n✅ Successful Assets: ${successfulBackgrounds} backgrounds, ${successfulCutScenes} cut scenes`);
      }
    })
    .catch((error) => {
      console.error(`❌ Error during media asset check: ${error}`);
      process.exit(1);
    });
}

if (require.main === module) {
  main();
}
