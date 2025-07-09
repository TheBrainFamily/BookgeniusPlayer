#!/usr/bin/env tsx

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { DOMParser } from "@xmldom/xmldom";
import { getFileNameForName } from "../src/utils/getFilePathsForName";
import { generateCharacterMetadata, parseBookXmlData } from "./generateBook";
import { SimpleCharacterMetadata } from "./data/tools/create-book-metadata";

interface CharacterAsset {
  name: string;
  hasPng: boolean;
  hasSpeaks: boolean;
  hasListens: boolean;
  isComplete: boolean;
  speaksCount: number;
  listensCount: number;
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
    if (element.nodeType === 1) {
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
): CharacterAsset {
  const assetsDir = join(bookPath, "assets");
  // Try different naming variations
  const name = getFileNameForName(characterName);
  const character = characterMetadata.find((c) => c.slug === characterName);
  if (!character) {
    throw new Error(`Character not found: ${characterName}`);
  }

  let hasPng = false;
  if (existsSync(join(assetsDir, `${name}.png`))) hasPng = true;

  let hasSpeaks = false;
  const speaksCount = character.infoPerChapter.reduce((acc, chapter) => acc + chapter.paragraphsWhereTalking.length, 0);
  // We ignore the fact that the character does not have the speak video if it speaks more than ignoreIfSpeaksLessFrequentThan times
  if (speaksCount > ignoreIfSpeaksLessFrequentThan) {
    hasSpeaks = true;
  }
  if (existsSync(join(assetsDir, `${name}-speaks.mp4`))) hasSpeaks = true;
  const listensCount = character.infoPerChapter.reduce((acc, chapter) => acc + chapter.paragraphsWhereTalking.length, 0);
  let hasListens = false;
  // We ignore the fact that the character does not have the listen video if it listens more than ignoreIfListensLessFrequentThan times
  if (listensCount > ignoreIfListensLessFrequentThan) {
    hasListens = true;
  }
  if (existsSync(join(assetsDir, `${name}-listens.mp4`))) hasListens = true;
  return { name: characterName, hasPng, hasSpeaks, hasListens, isComplete: hasPng && hasSpeaks && hasListens, speaksCount, listensCount };
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: tsx check-character-assets.ts <book-name>");
    console.error("Example: tsx check-character-assets.ts Krolowa-Sniegu");
    process.exit(1);
  }
  const bookPath = args[0];
  const { xmlDoc, bookString, bookForm, bookSlug } = parseBookXmlData(bookPath);
  const characterMetadata = generateCharacterMetadata(xmlDoc, bookString, bookForm, bookSlug);
  const ignoreIfSpeaksLessFrequentThan = parseInt(args[1] || "1000000000", 10);
  const ignoreIfListensLessFrequentThan = parseInt(args[2] || "1000000000", 10);
  const xmlPath = join(bookPath, "book.xml");
  if (!existsSync(xmlPath)) {
    throw new Error(`Book XML file not found: ${xmlPath}`);
  }
  console.log(`\n\n\nChecking book: ${bookPath}`);
  const characterNames = parseCharacterNames(xmlPath);
  console.log(`\nCharacters found in CharactersMaster (${characterNames.length}):`);
  const results = characterNames.map((name) => checkCharacterAssets(bookPath, name, characterMetadata, ignoreIfSpeaksLessFrequentThan, ignoreIfListensLessFrequentThan));
  const incomplete = results.filter((r) => !r.isComplete);
  if (incomplete.length > 0) {
    console.log(`❌ Incomplete: ${incomplete.length}`);
    console.log("\n❌ Missing Assets:");
    incomplete.forEach((char) => {
      const missing = [];
      if (!char.hasPng) missing.push("PNG");
      if (!char.hasSpeaks && char.speaksCount > 0) missing.push(`speaks.mp4 (${char.speaksCount})`);
      if (!char.hasListens && char.listensCount > 0) missing.push(`listens.mp4 (${char.listensCount})`);
      if (missing.length > 0) {
        console.log(`  ${char.name}: Missing: ${missing.join(", ")}`);
      }
    });
  }
}

if (require.main === module) {
  main();
}
