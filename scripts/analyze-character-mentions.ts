#!/usr/bin/env tsx

import * as fs from "fs";

interface CharacterStats {
  mentions: number;
  speeches: number;
}

interface CharacterAnalysis {
  [characterName: string]: CharacterStats;
}

function analyzeCharacterMentions(xmlFilePath: string): CharacterAnalysis {
  // Read the XML file
  const xmlContent = fs.readFileSync(xmlFilePath, "utf-8");

  // Extract character names from CharactersMaster section
  const characterNames = new Set<string>();
  const charactersMatch = xmlContent.match(/<CharactersMaster>([\s\S]*?)<\/CharactersMaster>/);

  if (charactersMatch) {
    const charactersSection = charactersMatch[1];
    const characterRegex = /<(\w[\w-]*)\s+display="[^"]*"/g;
    let match;

    while ((match = characterRegex.exec(charactersSection)) !== null) {
      characterNames.add(match[1]);
    }
  }

  // Initialize character stats
  const analysis: CharacterAnalysis = {};
  for (const name of characterNames) {
    analysis[name] = { mentions: 0, speeches: 0 };
  }

  // Extract content within Chapter tags
  const chapterRegex = /<Chapter[^>]*>([\s\S]*?)<\/Chapter>/g;
  let chapterMatch;

  while ((chapterMatch = chapterRegex.exec(xmlContent)) !== null) {
    const chapterContent = chapterMatch[1];

    // Find all character mentions and speeches within this chapter
    for (const characterName of characterNames) {
      // Pattern for character mentions (without talking="true")
      const mentionRegex = new RegExp(`<${characterName}>.*?</${characterName}>`, "g");
      const mentions = chapterContent.match(mentionRegex);
      if (mentions) {
        analysis[characterName].mentions += mentions.length;
      }

      // Pattern for character speeches (with talking="true")
      const speechRegex = new RegExp(`<${characterName}\\s+talking="true"`, "g");
      const speeches = chapterContent.match(speechRegex);
      if (speeches) {
        analysis[characterName].speeches += speeches.length;
      }
    }
  }

  return analysis;
}

function printAnalysis(analysis: CharacterAnalysis): void {
  console.log("Character Analysis Report");
  console.log("========================\n");

  // Sort characters by total activity (mentions + speeches)
  const sortedCharacters = Object.entries(analysis).sort(([, a], [, b]) => b.mentions + b.speeches - (a.mentions + a.speeches));

  console.log("| Character | Mentions | Speeches | Total |");
  console.log("|-----------|----------|----------|-------|");

  for (const [name, stats] of sortedCharacters) {
    const total = stats.mentions + stats.speeches;
    if (total > 0) {
      // Only show characters that appear in the story
      console.log(`| ${name.padEnd(9)} | ${stats.mentions.toString().padStart(8)} | ${stats.speeches.toString().padStart(8)} | ${total.toString().padStart(5)} |`);
    }
  }

  console.log("\nSummary:");
  console.log("--------");

  const totalCharacters = Object.keys(analysis).length;
  const activeCharacters = Object.values(analysis).filter((stats) => stats.mentions > 0 || stats.speeches > 0).length;
  const speakingCharacters = Object.values(analysis).filter((stats) => stats.speeches > 0).length;

  console.log(`Total characters defined: ${totalCharacters}`);
  console.log(`Characters that appear in story: ${activeCharacters}`);
  console.log(`Characters that speak: ${speakingCharacters}`);

  const totalMentions = Object.values(analysis).reduce((sum, stats) => sum + stats.mentions, 0);
  const totalSpeeches = Object.values(analysis).reduce((sum, stats) => sum + stats.speeches, 0);

  console.log(`Total character mentions: ${totalMentions}`);
  console.log(`Total character speeches: ${totalSpeeches}`);

  // Top speakers
  const topSpeakers = sortedCharacters.filter(([, stats]) => stats.speeches > 0).slice(0, 5);

  if (topSpeakers.length > 0) {
    console.log("\nTop 5 Characters by Speech Count:");
    for (let i = 0; i < topSpeakers.length; i++) {
      const [name, stats] = topSpeakers[i];
      console.log(`${i + 1}. ${name}: ${stats.speeches} speeches`);
    }
  }

  // Most mentioned
  const mostMentioned = sortedCharacters.filter(([, stats]) => stats.mentions > 0).slice(0, 5);

  if (mostMentioned.length > 0) {
    console.log("\nTop 5 Characters by Mention Count:");
    for (let i = 0; i < mostMentioned.length; i++) {
      const [name, stats] = mostMentioned[i];
      console.log(`${i + 1}. ${name}: ${stats.mentions} mentions`);
    }
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: ts-node analyze-character-mentions.ts <path-to-book.xml>");
    console.error("Example: ts-node analyze-character-mentions.ts public_books/Alice-Wonderland/book.xml");
    process.exit(1);
  }

  const xmlFilePath = args[0];

  if (!fs.existsSync(xmlFilePath)) {
    console.error(`Error: File not found: ${xmlFilePath}`);
    process.exit(1);
  }

  try {
    const analysis = analyzeCharacterMentions(xmlFilePath);
    printAnalysis(analysis);
  } catch (error) {
    console.error("Error analyzing file:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { analyzeCharacterMentions };
export type { CharacterAnalysis, CharacterStats };
