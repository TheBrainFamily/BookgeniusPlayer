#!/usr/bin/env tsx

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { DOMParser } from "@xmldom/xmldom";

interface CharacterAsset {
  name: string;
  hasPng: boolean;
  hasSpeaks: boolean;
  hasListens: boolean;
  isComplete: boolean;
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

function checkCharacterAssets(bookPath: string, characterName: string): CharacterAsset {
  const assetsDir = join(bookPath, "assets");
  // Try different naming variations
  const nameVariations = [
    characterName.toLowerCase(),
    characterName.toLowerCase().replace(/-/g, ""),
    characterName.toLowerCase().replace(/-/g, "_"),
    characterName === "Platki-sniezne-Straze-Krolowej-Sniegu" ? "platki-sniezne" : null,
    characterName === "Wroble" ? "wroble" : null,
  ].filter(Boolean) as string[];
  let hasPng = false;
  let hasSpeaks = false;
  let hasListens = false;
  for (const name of nameVariations) {
    if (existsSync(join(assetsDir, `${name}.png`))) hasPng = true;
    if (existsSync(join(assetsDir, `${name}-speaks.mp4`))) hasSpeaks = true;
    if (existsSync(join(assetsDir, `${name}-listens.mp4`))) hasListens = true;
  }
  return { name: characterName, hasPng, hasSpeaks, hasListens, isComplete: hasPng && hasSpeaks && hasListens };
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: tsx check-character-assets.ts <book-name>");
    console.error("Example: tsx check-character-assets.ts Krolowa-Sniegu");
    process.exit(1);
  }
  const bookName = args[0];
  const bookPath = `public_books/${bookName}`;
  const xmlPath = join(bookPath, "book.xml");
  if (!existsSync(xmlPath)) {
    throw new Error(`Book XML file not found: ${xmlPath}`);
  }
  const characterNames = parseCharacterNames(xmlPath);
  console.log(`\nCharacters found in CharactersMaster (${characterNames.length}):`);
  characterNames.forEach((name, idx) => console.log(`${idx + 1}. ${name}`));
  console.log("");
  const results = characterNames.map((name) => checkCharacterAssets(bookPath, name));
  const complete = results.filter((r) => r.isComplete);
  const incomplete = results.filter((r) => !r.isComplete);
  console.log(`Total Characters: ${characterNames.length}`);
  console.log(`✅ Complete: ${complete.length}`);
  console.log(`❌ Incomplete: ${incomplete.length}`);
  if (incomplete.length > 0) {
    console.log("\n❌ Missing Assets:");
    incomplete.forEach((char) => {
      const missing = [];
      if (!char.hasPng) missing.push("PNG");
      if (!char.hasSpeaks) missing.push("speaks.mp4");
      if (!char.hasListens) missing.push("listens.mp4");
      console.log(`  ${char.name}: Missing: ${missing.join(", ")}`);
    });
  }
  if (complete.length > 0) {
    console.log("\n✅ Complete Assets:");
    complete.forEach((char) => {
      console.log(`  ${char.name}: PNG ✅, speaks.mp4 ✅, listens.mp4 ✅`);
    });
  }
  if (incomplete.length > 0) process.exit(1);
}

if (require.main === module) {
  main();
}
