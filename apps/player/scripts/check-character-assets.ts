#!/usr/bin/env tsx

// Check check-character-assets.md to see how to use this script

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { DOMParser } from "@xmldom/xmldom";
import { getFileNameForName, setKnownVideos } from "../src/utils/getFilePathsForName";
import { generateCharacterMetadata, parseBookXmlData } from "./generateBook";
import { SimpleCharacterMetadata } from "./data/tools/create-book-metadata";

interface FileSize {
  width: number;
  height: number;
}

interface CharacterAsset {
  name: string;
  hasPng: boolean;
  hasSpeaks: boolean;
  hasListens: boolean;
  isComplete: boolean;
  speaksCount: number;
  listensCount: number;
  pngSize?: FileSize;
  speaksSize?: FileSize;
  listensSize?: FileSize;
  pngSizeCorrect: boolean;
  speaksSizeCorrect: boolean;
  listensSizeCorrect: boolean;
}

interface UnreferencedAsset {
  filename: string;
  type: "png" | "mp4";
  size?: FileSize;
  isCharacterAsset: boolean;
  potentialCharacter?: string;
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

function getPngDimensions(filePath: string): FileSize | null {
  try {
    const output = execSync(`identify -format "%wx%h" "${filePath}"`, { encoding: "utf8" });
    const [width, height] = output.trim().split("x").map(Number);
    return { width, height };
  } catch {
    return null;
  }
  return null;
}

function parseCharacterNames(xmlPath: string): string[] {
  const xmlContent = readFileSync(xmlPath, "utf-8");
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, "text/xml");
  const charactersMaster = doc.getElementsByTagName("CharactersMaster")[0];
  const characterElements = charactersMaster ? charactersMaster.getElementsByTagName("*") : [];
  const characters: string[] = [];
  for (let i = 0; i < characterElements.length; i++) {
    const element = characterElements[i];
    if (element.nodeType === 1 && element.tagName !== "Override") {
      characters.push(element.tagName);
    }
  }
  return characters;
}

function checkCharacterAssets(
  bookPath: string,
  characterName: string,
  characterMetadata: SimpleCharacterMetadata[],
  ignoreIfSpeaksLessFrequentThan: number,
  ignoreIfListensLessFrequentThan: number,
  skipListens: boolean = false,
): CharacterAsset {
  const assetsDir = join(bookPath, "assets");
  // Try different naming variations
  const name = getFileNameForName(characterName);
  const character = characterMetadata.find((c) => c.slug === characterName);
  if (!character) {
    throw new Error(`Character not found: ${characterName}`);
  }

  let hasPng = false;
  let pngSize: FileSize | undefined;
  let pngSizeCorrect = true;
  const pngPath = join(assetsDir, `${name}.png`);
  if (existsSync(pngPath)) {
    hasPng = true;
    pngSize = getPngDimensions(pngPath);
  }

  let hasSpeaks = false;
  let speaksSize: FileSize | undefined;
  let speaksSizeCorrect = true;
  const speaksCount = character.infoPerChapter.reduce((acc, chapter) => acc + chapter.paragraphsWhereTalking.length, 0);
  const speaksPath = join(assetsDir, `${name}-speaks.mp4`);
  // We ignore the fact that the character does not have the speak video if it speaks more than ignoreIfSpeaksLessFrequentThan times
  if (speaksCount <= ignoreIfSpeaksLessFrequentThan) {
    hasSpeaks = true;
  }
  if (existsSync(speaksPath)) {
    hasSpeaks = true;
    speaksSize = getFileDimensions(speaksPath);
  }

  const listensCount = character.infoPerChapter.reduce((acc, chapter) => acc + chapter.paragraphsWhereTalking.length, 0);
  let hasListens = false;
  let listensSize: FileSize | undefined;
  let listensSizeCorrect = true;
  const listensPath = join(assetsDir, `${name}-listens.mp4`);
  // We ignore the fact that the character does not have the listen video if it listens more than ignoreIfListensLessFrequentThan times
  if (skipListens || listensCount <= ignoreIfListensLessFrequentThan) {
    hasListens = true;
  }
  if (existsSync(listensPath)) {
    hasListens = true;
    listensSize = getFileDimensions(listensPath);
  }

  // For PNG size checking, we only care if the listens.mp4 file actually exists
  const hasListensFile = existsSync(listensPath);

  // Check dimensions
  if (speaksSize) {
    speaksSizeCorrect = speaksSize.width === 480 && speaksSize.height === 480;
  }
  if (listensSize) {
    listensSizeCorrect = listensSize.width === 480 && listensSize.height === 480;
  }
  if (pngSize) {
    // If there's a listens.mp4 file, PNG should be 256x256 or 200x200
    // If no listens.mp4 file, PNG should be 480x480
    if (hasListensFile) {
      pngSizeCorrect = (pngSize.width === 256 && pngSize.height === 256) || (pngSize.width === 200 && pngSize.height === 200);
    } else {
      pngSizeCorrect = pngSize.width === 480 && pngSize.height === 480;
    }
  }

  return {
    name: characterName,
    hasPng,
    hasSpeaks,
    hasListens,
    isComplete: hasPng && hasSpeaks && hasListens,
    speaksCount,
    listensCount,
    pngSize,
    speaksSize,
    listensSize,
    pngSizeCorrect,
    speaksSizeCorrect,
    listensSizeCorrect,
  };
}

function findUnreferencedAssets(bookPath: string, characterNames: string[]): UnreferencedAsset[] {
  const assetsDir = join(bookPath, "assets");
  if (!existsSync(assetsDir)) {
    return [];
  }

  const allFiles = readdirSync(assetsDir);
  const assetFiles = allFiles.filter((file) => file.endsWith(".png") || file.endsWith(".mp4"));

  const unreferencedAssets: UnreferencedAsset[] = [];

  assetFiles.forEach((filename) => {
    const isPng = filename.endsWith(".png");
    const type = isPng ? "png" : "mp4";
    const nameWithoutExt = filename.replace(isPng ? ".png" : ".mp4", "");

    const isCharacterAsset = characterNames.some((charName) => {
      const expectedName = getFileNameForName(charName);
      if (isPng) {
        return nameWithoutExt === expectedName;
      }
      return nameWithoutExt === `${expectedName}-speaks` || nameWithoutExt === `${expectedName}-listens`;
    });

    const isCharacterAssetWithSuffix =
      isPng &&
      characterNames.some((charName) => {
        const expectedName = getFileNameForName(charName);
        return nameWithoutExt.startsWith(`${expectedName}-`);
      });

    const isChapterAsset = /^[a-z-]+-chapter-\d+/.test(nameWithoutExt);

    const isSpecialAsset = /^[a-z-]+-[a-z-]+/.test(nameWithoutExt) && (isPng ? !isCharacterAssetWithSuffix : !isCharacterAsset);

    const isReferenced = isCharacterAsset || (isPng && isCharacterAssetWithSuffix) || isChapterAsset || isSpecialAsset;

    if (!isReferenced) {
      const potentialCharacter = characterNames.find((charName) => {
        const expectedName = getFileNameForName(charName);
        return nameWithoutExt.includes(expectedName) || expectedName.includes(nameWithoutExt);
      });

      unreferencedAssets.push({
        filename,
        type,
        size: isPng ? getPngDimensions(join(assetsDir, filename)) || undefined : getFileDimensions(join(assetsDir, filename)) || undefined,
        isCharacterAsset: false,
        potentialCharacter: potentialCharacter || undefined,
      });
    }
  });

  return unreferencedAssets;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: tsx check-character-assets.ts <book-name> [ignoreIfSpeaksLessThan] [ignoreIfListensLessThan] [--skipListens]");
    console.error("Example: tsx check-character-assets.ts Krolowa-Sniegu");
    console.error("Example: tsx check-character-assets.ts Wukong 4 4 --skipListens");
    process.exit(1);
  }

  // Filter out flags and get the book path
  const skipListens = args.includes("--skipListens");
  const nonFlagArgs = args.filter((arg) => !arg.startsWith("--"));
  const bookPath = nonFlagArgs[0];

  const {
    xmlDoc,
    bookString,
    metadata: { form, slug },
  } = parseBookXmlData(bookPath);

  // Set up known videos before generating character metadata
  const assetsPath = join(bookPath, "assets");
  let videoFiles: string[] = [];
  if (existsSync(assetsPath)) {
    videoFiles = readdirSync(assetsPath).filter((file) => file.endsWith(".mp4"));
  }
  setKnownVideos(videoFiles);

  const characterMetadata = generateCharacterMetadata(xmlDoc, bookString, form, slug);
  const ignoreIfSpeaksLessFrequentThan = parseInt(nonFlagArgs[1] || "0", 10);
  const ignoreIfListensLessFrequentThan = parseInt(nonFlagArgs[2] || "0", 10);
  const xmlPath = join(bookPath, "book.xml");
  if (!existsSync(xmlPath)) {
    throw new Error(`Book XML file not found: ${xmlPath}`);
  }
  console.log(`\n\n\nChecking book: ${bookPath}`);
  if (skipListens) {
    console.log("⏭️  Skipping listens.mp4 checks");
  }
  const characterNames = parseCharacterNames(xmlPath);
  console.log(`\nCharacters found in CharactersMaster (${characterNames.length}):`);
  const results = characterNames.map((name) =>
    checkCharacterAssets(bookPath, name, characterMetadata, ignoreIfSpeaksLessFrequentThan, ignoreIfListensLessFrequentThan, skipListens),
  );

  // Check for missing assets
  const incomplete = results.filter((r) => !r.isComplete);
  if (incomplete.length > 0) {
    console.log(`❌ Incomplete: ${incomplete.length}`);
    console.log("\n❌ Missing Assets:");
    incomplete.forEach((char) => {
      const missing = [];
      if (!char.hasPng) missing.push("PNG");
      if (!char.hasSpeaks && char.speaksCount > 0) missing.push(`speaks.mp4 (${char.speaksCount})`);
      if (!skipListens && !char.hasListens && char.listensCount > 0) missing.push(`listens.mp4 (${char.listensCount})`);
      if (missing.length > 0) {
        console.log(`  ${char.name}: Missing: ${missing.join(", ")}`);
      }
    });
  }

  // Check for dimension issues
  const dimensionIssues = results.filter((r) => (r.pngSize && !r.pngSizeCorrect) || (r.speaksSize && !r.speaksSizeCorrect) || (r.listensSize && !r.listensSizeCorrect));

  if (dimensionIssues.length > 0) {
    console.log(`\n⚠️  Dimension Issues: ${dimensionIssues.length}`);
    console.log("\n⚠️  Incorrect Dimensions:");
    dimensionIssues.forEach((char) => {
      const issues = [];
      if (char.pngSize && !char.pngSizeCorrect) {
        const expected = char.hasListens ? "256x256 or 200x200" : "480x480";
        issues.push(`PNG: ${char.pngSize.width}x${char.pngSize.height} (expected ${expected})`);
      }
      if (char.speaksSize && !char.speaksSizeCorrect) {
        issues.push(`speaks.mp4: ${char.speaksSize.width}x${char.speaksSize.height} (expected 480x480)`);
      }
      if (char.listensSize && !char.listensSizeCorrect) {
        issues.push(`listens.mp4: ${char.listensSize.width}x${char.listensSize.height} (expected 480x480)`);
      }
      if (issues.length > 0) {
        console.log(`  ${char.name}: ${issues.join(", ")}`);
      }
    });
  }

  // Check for unreferenced assets
  const unreferencedAssets = findUnreferencedAssets(bookPath, characterNames);
  if (unreferencedAssets.length > 0) {
    console.log(`\n🔍 Unreferenced Assets: ${unreferencedAssets.length}`);
    console.log("\n🔍 Assets not in CharactersMaster:");
    unreferencedAssets.forEach((asset) => {
      const sizeInfo = asset.size ? ` (${asset.size.width}x${asset.size.height})` : "";
      const potentialChar = asset.potentialCharacter ? ` [potential: ${asset.potentialCharacter}]` : "";
      console.log(`  ${asset.filename}${sizeInfo}${potentialChar}`);
    });
  }

  // Summary
  const totalIssues = incomplete.length + dimensionIssues.length + unreferencedAssets.length;
  if (totalIssues === 0) {
    console.log("\n✅ All character assets are complete, properly sized, and all assets are referenced!");
  } else {
    console.log(`\n📊 Summary: ${incomplete.length} missing assets, ${dimensionIssues.length} dimension issues, ${unreferencedAssets.length} unreferenced assets`);
  }
}

if (require.main === module) {
  main();
}
