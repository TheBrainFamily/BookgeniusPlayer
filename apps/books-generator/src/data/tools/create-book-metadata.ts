import { XMLSerializer } from "@xmldom/xmldom";
import { Element, XMLDocument } from "@xmldom/xmldom/lib/dom"; // Import types if needed for strict typing

export interface ChapterInfo {
  chapter: number;
  summary: string;
  paragraphsWhereSpotted: number[]; // 0-based index of <p> tag
  paragraphsWhereTalking: number[]; // 0-based index of <p> tag
  paragraphsWhereEnters?: number[]; // 0-based index of <p> tag
  paragraphsWhereExits?: number[]; // 0-based index of <p> tag
}

export interface CharacterOverrideMetadata {
  from: { chapter: number; paragraph: number };
  to?: { chapter: number; paragraph: number };
  summary?: string;
  display?: string;
  avatar?: string;
}

export interface SimpleCharacterMetadata {
  slug: string; // The XML tag name, e.g., "Ksiaze-Ramzes"
  characterName: string; // The display name, e.g., "Książe Ramzes"
  bookSlug: string;
  infoPerChapter: ChapterInfo[];
  overrides?: CharacterOverrideMetadata[];
}

export enum ListType {
  SPOTTED = "spotted",
  TALKING = "talking",
  ENTERS = "enters",
  EXITS = "exits",
}

/**
 * Parses the CharactersMaster XML to extract character tag names.
 * @param charactersXml The XML string containing <CharactersMaster>.
 * @returns A Set containing the tag names of the characters.
 */
export function getCharacterTags(doc: XMLDocument): Set<string> {
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
const OVERRIDE_REF_REGEX = /^ch(\d+)-p(\d+)$/i;

const parseChapterParagraphRef = (ref?: string | null): { chapter: number; paragraph: number } | null => {
  if (!ref) return null;
  const normalized = ref.trim();
  const match = normalized.match(OVERRIDE_REF_REGEX);
  if (!match) {
    console.warn(`[create-book-metadata] Invalid chapter/paragraph reference: "${ref}"`);
    return null;
  }

  const chapter = Number.parseInt(match[1], 10);
  const paragraph = Number.parseInt(match[2], 10);

  if (Number.isNaN(chapter) || Number.isNaN(paragraph)) {
    console.warn(`[create-book-metadata] Unable to parse chapter/paragraph numbers from reference: "${ref}"`);
    return null;
  }

  return { chapter, paragraph };
};

const collectOverridesFromCharacterElement = (element: Element): CharacterOverrideMetadata[] => {
  const overrides: CharacterOverrideMetadata[] = [];

  for (let i = 0; i < element.childNodes.length; i++) {
    const node = element.childNodes[i];
    if (node.nodeType !== node.ELEMENT_NODE) continue;

    const overrideEl = node as Element;
    const tagName = overrideEl.tagName.toLowerCase();

    if (tagName !== "override" && tagName !== "overwrite") continue;

    const fromRef = parseChapterParagraphRef(overrideEl.getAttribute("from"));
    if (!fromRef) {
      console.warn(`[create-book-metadata] Skipping override for ${element.tagName} due to missing or invalid "from" attribute.`);
      continue;
    }

    const toRef = parseChapterParagraphRef(overrideEl.getAttribute("to"));
    const summary = overrideEl.getAttribute("summary") || undefined;
    const display = overrideEl.getAttribute("display") || undefined;
    const avatar = overrideEl.getAttribute("avatar") || undefined;

    if (!summary && !display && !avatar && !toRef) {
      // Nothing to override besides start location; skip to avoid noisey data
      console.warn(`[create-book-metadata] Override for ${element.tagName} at ${overrideEl.getAttribute("from") || "unknown"} has no payload; skipping.`);
      continue;
    }

    overrides.push({ from: fromRef, to: toRef, summary, display, avatar });
  }

  return overrides;
};

export function getCharacterOverrides(doc: XMLDocument): Map<string, CharacterOverrideMetadata[]> {
  const overridesMap = new Map<string, CharacterOverrideMetadata[]>();

  try {
    const masterElement = doc.getElementsByTagName("CharactersMaster")[0];

    if (!masterElement) {
      return overridesMap;
    }

    for (let i = 0; i < masterElement.childNodes.length; i++) {
      const node = masterElement.childNodes[i];
      if (node.nodeType !== node.ELEMENT_NODE) continue;

      const element = node as Element;
      const overrides = collectOverridesFromCharacterElement(element);
      if (overrides.length > 0) {
        overridesMap.set(element.tagName, overrides);
      }
    }
  } catch (error) {
    console.error("Error parsing character overrides:", error);
  }

  return overridesMap;
}

export function extractCharacterMetadata(
  doc: XMLDocument,
  characterTags: Set<string>,
  bookForm: string,
  bookSlug: string,
  characterOverrides?: Map<string, CharacterOverrideMetadata[]>,
): SimpleCharacterMetadata[] {
  // Initialize results map keyed by character tag name
  const resultsMap = new Map<string, SimpleCharacterMetadata>();
  characterTags.forEach((tag) => {
    const base: SimpleCharacterMetadata = { slug: tag, characterName: getDisplayForCharacter(tag, doc), bookSlug, infoPerChapter: [] };

    const overrides = characterOverrides?.get(tag);
    if (overrides && overrides.length > 0) {
      base.overrides = overrides;
    }

    resultsMap.set(tag, base);
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

      let dataIndex = 0;

      // Iterate over direct child nodes of the chapter
      for (let j = 0; j < chapterElement.childNodes.length; j++) {
        const node = chapterElement.childNodes[j];

        // Check if it's an element node
        if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
          // --- Process Each Paragraph ---
          const paragraph = node as Element;
          const spottedInPara = new Set<string>(); // Track characters spotted in this para
          const talksInPara = new Set<string>(); // Track characters talking in this para
          const entersInPara = new Set<string>();
          const exitsInPara = new Set<string>();

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

                if (element.getAttribute("dynasty") === "true") continue;

                if (element.getAttribute("enters") === "true") {
                  entersInPara.add(tagName);
                } else if (element.getAttribute("exits") === "true") {
                  exitsInPara.add(tagName);
                }

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
          const updateCharacterInfo = (charTag: string, listType: ListType) => {
            const data = resultsMap.get(charTag);

            if (!data) return; // Should not happen if initialized correctly

            // Find or create the entry for the current chapter
            let chapterEntry = data.infoPerChapter.find((info) => info.chapter === chapterId);
            if (!chapterEntry) {
              chapterEntry = { chapter: chapterId, summary: getSummaryForCharacter(charTag, doc), paragraphsWhereSpotted: [], paragraphsWhereTalking: [] };
              if (bookForm === "play" || bookForm === "mixed") {
                chapterEntry.paragraphsWhereEnters = [];
                chapterEntry.paragraphsWhereExits = [];
              }
              data.infoPerChapter.push(chapterEntry);
              // Keep chapter entries sorted by chapter number
              data.infoPerChapter.sort((a, b) => a.chapter - b.chapter);
            }

            // Add the current paragraph index if not already present
            let targetArray: number[];
            switch (listType) {
              case ListType.SPOTTED:
                targetArray = chapterEntry.paragraphsWhereSpotted;
                break;
              case ListType.TALKING:
                targetArray = chapterEntry.paragraphsWhereTalking;
                break;
              case ListType.ENTERS:
                targetArray = chapterEntry.paragraphsWhereEnters!;
                break;
              case ListType.EXITS:
                targetArray = chapterEntry.paragraphsWhereExits!;
                break;
            }

            if (!targetArray.includes(dataIndex)) {
              targetArray.push(dataIndex);
              // Keep paragraph indices sorted
              // targetArray.sort((a, b) => a - b); // Sorting done later globally
            }
          };

          talksInPara.forEach((charTag) => updateCharacterInfo(charTag, ListType.TALKING));
          spottedInPara.forEach((charTag) => updateCharacterInfo(charTag, ListType.SPOTTED));
          if (bookForm === "play" || bookForm === "mixed") {
            entersInPara.forEach((charTag) => updateCharacterInfo(charTag, ListType.ENTERS));
            exitsInPara.forEach((charTag) => updateCharacterInfo(charTag, ListType.EXITS));
          }
          dataIndex++;
        }
      } // End loop through paragraphs
    } // End loop through chapters

    // Optional: Sort paragraph index arrays numerically for consistency
    resultsMap.forEach((data) => {
      data.infoPerChapter.forEach((chapterInfo) => {
        chapterInfo.paragraphsWhereSpotted.sort((a, b) => a - b);
        chapterInfo.paragraphsWhereTalking.sort((a, b) => a - b);
        if (bookForm === "play" || bookForm === "mixed") {
          chapterInfo.paragraphsWhereEnters.sort((a, b) => a - b);
          chapterInfo.paragraphsWhereExits.sort((a, b) => a - b);
        }
      });
    });

    // Convert the map values to the final array format
    return Array.from(resultsMap.values());
  } catch (error) {
    console.error("Error analyzing generated chapter XML:", error);
    return []; // Return empty array on error
  }
}

const getSummaryForCharacter = (slug: string, doc: XMLDocument) => {
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
        if (element.tagName === slug) {
          return element.getAttribute("summary");
        }
      }
    }
    console.warn(`Could not find character ${slug} in <CharactersMaster> element.`);
    return "FIX ME";
  } catch (error) {
    console.error("Error parsing CharactersMaster XML:", error);
    return "FIX ME";
  }
};

const getDisplayForCharacter = (slug: string, doc: XMLDocument) => {
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
        if (element.tagName === slug) {
          return element.getAttribute("display");
        }
      }
    }
    console.warn(`Could not find character ${slug} in <CharactersMaster> element.`);
    return "FIX ME";
  } catch (error) {
    console.error("Error parsing CharactersMaster XML:", error);
    return "FIX ME";
  }
};
