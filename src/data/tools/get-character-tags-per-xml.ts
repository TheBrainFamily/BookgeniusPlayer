import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { Node, Element, XMLDocument } from "@xmldom/xmldom/lib/dom"; // Import types if needed for strict typing
import fs from "fs";
import path from "path";
interface ChapterInfo {
  chapter: number;
  summary: string;
  paragraphsWhereSpotted: number[]; // 0-based index of <p> tag
  paragraphsWhereTalking: number[]; // 0-based index of <p> tag
}

interface SimpleCharacterMetadata {
  characterName: string; // The XML tag name, e.g., "Ksiaze-Ramzes"
  bookSlug: string;
  infoPerChapter: ChapterInfo[];
  imageUrl: string;
}

/**
 * Parses the CharactersMaster XML to extract character tag names.
 * @param charactersXml The XML string containing <CharactersMaster>.
 * @returns A Set containing the tag names of the characters.
 */
function getCharacterTags(doc: XMLDocument): Set<string> {
  const characterTags = new Set<string>();
  try {
    const masterElement = doc.getElementsByTagName("CharactersMaster")[0];

    if (!masterElement) {
      console.warn("Could not find <CharactersMaster> element.");
      return characterTags;
    }

    for (let i = 0; i < masterElement.childNodes.length; i++) {
      const node = masterElement.childNodes[i];
      if (node.nodeType === node.ELEMENT_NODE) {
        characterTags.add((node as Element).tagName);
      }
    }
  } catch (error) {
    console.error("Error parsing CharactersMaster XML:", error);
  }
  return characterTags;
}

/**
 * Analyzes generated chapter XML to find character mentions and speaking parts.
 * @param generatedChapterXml The XML string for a single chapter, processed by the LLM.
 * @param characterTags A Set containing the valid character tag names.
 * @returns An array of SimpleCharacterMetadata objects.
 */
function extractCharacterMetadata(doc: XMLDocument, characterTags: Set<string>): SimpleCharacterMetadata[] {
  // Initialize results map keyed by character tag name
  const resultsMap = new Map<string, SimpleCharacterMetadata>();
  characterTags.forEach((tag) => {
    resultsMap.set(tag, { characterName: getDisplayForCharacter(tag, doc), bookSlug: "Pharaon", infoPerChapter: [], imageUrl: "UNKNOWN" });
  });

  try {
    // Basic parser error check
    const parserError = doc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
      const serializer = new XMLSerializer();
      console.error("Error parsing generated chapter XML:", serializer.serializeToString(parserError[0]));
      return []; // Return empty on error
    }

    // Find all <Chapter> elements
    const chapterElements = doc.getElementsByTagName("Chapter");
    if (chapterElements.length === 0) {
      console.warn("No <Chapter> elements found in the generated XML.");
      return []; // Return empty if no chapters found
    }

    // Process each chapter
    for (let chapterIndex = 0; chapterIndex < chapterElements.length; chapterIndex++) {
      const chapterElement = chapterElements[chapterIndex];

      const chapterIdAttr = chapterElement.getAttribute("id");
      if (!chapterIdAttr || isNaN(parseInt(chapterIdAttr, 10))) {
        console.warn(`Chapter element at index ${chapterIndex} is missing or has an invalid ID. Skipping.`);
        continue; // Skip this chapter if ID is invalid
      }
      const chapterId = parseInt(chapterIdAttr, 10);

      const paragraphs = chapterElement.getElementsByTagName("p");

      // --- Process Each Paragraph ---
      for (let pIndex = 0; pIndex < paragraphs.length; pIndex++) {
        const paragraph = paragraphs[pIndex];
        const spottedInPara = new Set<string>(); // Track characters spotted in this para
        const talksInPara = new Set<string>(); // Track characters talking in this para

        // Iterate through all direct children of the paragraph
        for (let i = 0; i < paragraph.childNodes.length; i++) {
          const node = paragraph.childNodes[i];

          // We only care about element nodes (tags)
          if (node.nodeType === node.ELEMENT_NODE) {
            const element = node as Element;
            const tagName = element.tagName;

            // Check if this tag is one of our characters
            if (characterTags.has(tagName)) {
              // Check for the specific talking="true" attribute
              if (element.getAttribute("talking") === "true") {
                talksInPara.add(tagName);
              } else {
                // It's a regular mention (e.g., <Tag>Text</Tag>)
                // Check if it actually contains text or other nodes,
                // to potentially distinguish from empty leftover tags if needed,
                // but generally, its presence means spotted.
                spottedInPara.add(tagName);
              }
            }
            // Could add recursive check here if tags might be nested deeper,
            // but based on your example, they are direct children of <p>
          }
        } // End loop through paragraph children

        // --- Update Results Based on Findings in this Paragraph ---
        const updateCharacterInfo = (charTag: string, listType: "spotted" | "talking") => {
          const data = resultsMap.get(charTag);
          if (!data) return; // Should not happen if initialized correctly

          // Find or create the entry for the current chapter
          let chapterEntry = data.infoPerChapter.find((info) => info.chapter === chapterId);
          if (!chapterEntry) {
            chapterEntry = { chapter: chapterId, summary: getSummaryForCharacter(charTag, doc), paragraphsWhereSpotted: [], paragraphsWhereTalking: [] };
            data.infoPerChapter.push(chapterEntry);
            // Keep chapter entries sorted by chapter number
            data.infoPerChapter.sort((a, b) => a.chapter - b.chapter);
          }

          // Add the current paragraph index if not already present
          const targetArray = listType === "talking" ? chapterEntry.paragraphsWhereTalking : chapterEntry.paragraphsWhereSpotted;

          if (!targetArray.includes(pIndex)) {
            targetArray.push(pIndex);
            // Keep paragraph indices sorted
            // targetArray.sort((a, b) => a - b); // Sorting done later globally
          }
        };

        talksInPara.forEach((charTag) => updateCharacterInfo(charTag, "talking"));
        spottedInPara.forEach((charTag) => updateCharacterInfo(charTag, "spotted"));
      } // End loop through paragraphs
    } // End loop through chapters

    // Optional: Sort paragraph index arrays numerically for consistency
    resultsMap.forEach((data) => {
      data.infoPerChapter.forEach((chapterInfo) => {
        chapterInfo.paragraphsWhereSpotted.sort((a, b) => a - b);
        chapterInfo.paragraphsWhereTalking.sort((a, b) => a - b);
      });
    });

    // Convert the map values to the final array format
    return Array.from(resultsMap.values());
  } catch (error) {
    console.error("Error analyzing generated chapter XML:", error);
    return []; // Return empty array on error
  }
}

const getSummaryForCharacter = (characterName: string, doc: XMLDocument) => {
  try {
    const masterElement = doc.getElementsByTagName("CharactersMaster")[0];

    if (!masterElement) {
      console.warn("Could not find <CharactersMaster> element.");
      return "FIX ME";
    }

    for (let i = 0; i < masterElement.childNodes.length; i++) {
      const node = masterElement.childNodes[i];
      if (node.nodeType === node.ELEMENT_NODE) {
        const element = node as Element;
        if (element.tagName === characterName) {
          return element.getAttribute("summary");
        }
      }
    }
    console.warn(`Could not find character ${characterName} in <CharactersMaster> element.`);
    return "FIX ME";
  } catch (error) {
    console.error("Error parsing CharactersMaster XML:", error);
    return "FIX ME";
  }
};

const getDisplayForCharacter = (characterName: string, doc: XMLDocument) => {
  try {
    const masterElement = doc.getElementsByTagName("CharactersMaster")[0];

    if (!masterElement) {
      console.warn("Could not find <CharactersMaster> element.");
      return "FIX ME";
    }

    for (let i = 0; i < masterElement.childNodes.length; i++) {
      const node = masterElement.childNodes[i];
      if (node.nodeType === node.ELEMENT_NODE) {
        const element = node as Element;
        if (element.tagName === characterName) {
          return element.getAttribute("display");
        }
      }
    }
    console.warn(`Could not find character ${characterName} in <CharactersMaster> element.`);
    return "FIX ME";
  } catch (error) {
    console.error("Error parsing CharactersMaster XML:", error);
    return "FIX ME";
  }
};

// --- Example Usage ---

const chaptersXml = fs.readFileSync(path.join(__dirname, "../chapters.xml"), "utf8");

const parser = new DOMParser();
const doc = parser.parseFromString(chaptersXml.replace(`<?xml version="1.0" encoding="UTF-8" ?>`, ""), "text/xml");
// 1. Get the list of character tags
const characterTags = getCharacterTags(doc);
console.log("Character Tags:", characterTags);

// 2. Analyze the generated chapter
const metadata = extractCharacterMetadata(doc, characterTags);

// 3. Output the result
console.log("Extracted Metadata:", JSON.stringify(metadata, null, 2));
fs.writeFileSync(path.join(__dirname, "../metadata.ts"), `export const pharaonCharactersData = ${JSON.stringify(metadata, null, 2)}`);
