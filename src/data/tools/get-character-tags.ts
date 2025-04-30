import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { Node, Element } from "@xmldom/xmldom/lib/dom"; // Import types if needed for strict typing

interface ChapterInfo {
  chapter: number;
  paragraphsWhereSpotted: number[]; // 0-based index of <p> tag
  paragraphsWhereTalking: number[]; // 0-based index of <p> tag
}

interface SimpleCharacterMetadata {
  characterName: string; // The XML tag name, e.g., "Ksiaze-Ramzes"
  infoPerChapter: ChapterInfo[];
}

/**
 * Parses the CharactersMaster XML to extract character tag names.
 * @param charactersXml The XML string containing <CharactersMaster>.
 * @returns A Set containing the tag names of the characters.
 */
function getCharacterTags(doc: Document): Set<string> {
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
function extractCharacterMetadata(doc: Document, characterTags: Set<string>): SimpleCharacterMetadata[] {
  // Initialize results map keyed by character tag name
  const resultsMap = new Map<string, SimpleCharacterMetadata>();
  characterTags.forEach((tag) => {
    resultsMap.set(tag, { characterName: tag, infoPerChapter: [] });
  });

  try {
    // Basic parser error check
    const parserError = doc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
      const serializer = new XMLSerializer();
      console.error("Error parsing generated chapter XML:", serializer.serializeToString(parserError[0]));
      return []; // Return empty on error
    }

    const chapterElement = doc.documentElement; // Assumes root is <Chapter>
    if (!chapterElement || chapterElement.tagName !== "Chapter") {
      throw new Error("Generated XML root element is not <Chapter>");
    }

    const chapterIdAttr = chapterElement.getAttribute("id");
    if (!chapterIdAttr || isNaN(parseInt(chapterIdAttr, 10))) {
      throw new Error("Chapter ID is missing or invalid in generated XML");
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
          chapterEntry = { chapter: chapterId, paragraphsWhereSpotted: [], paragraphsWhereTalking: [] };
          data.infoPerChapter.push(chapterEntry);
        }

        // Add the current paragraph index if not already present
        const targetArray = listType === "talking" ? chapterEntry.paragraphsWhereTalking : chapterEntry.paragraphsWhereSpotted;

        if (!targetArray.includes(pIndex)) {
          targetArray.push(pIndex);
        }
      };

      talksInPara.forEach((charTag) => updateCharacterInfo(charTag, "talking"));
      spottedInPara.forEach((charTag) => updateCharacterInfo(charTag, "spotted"));
    } // End loop through paragraphs

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

// --- Example Usage ---

const charactersXml = `
<CharactersMaster>
    <Ksiaze-Ramzes display="Książe Ramzes" summary="Młodszy syn faraona" />
    <Nikotris display="Nikotris" summary="Królowa Egiptu, matka Ramzesa" />
    <Herhor display="Herhor" summary="Arcykapłan i minister wojny" />
    <Sara display="Sara" summary="Piękna Hebrajka, ukochana Ramzesa" />
    <Tutmozis display="Tutmozis" summary="Krewny Ramzesa, koncentrujący się na uciechach" />
</CharactersMaster>
`;

const generatedChapterXml = `
<Chapter id="1">
    <p> Dopiero czwarty syn, <Ksiaze-Ramzes>Ramzes</Ksiaze-Ramzes>, urodzony z królowej <Nikotris>Nikotris</Nikotris>, córki arcykapłana Amenhotepa był silny jak wół Api, odważny jak lew i mądry jak kapłani. Od dzieciństwa otaczał się wojskowymi i jeszcze będąc zwyczajnym księciem, mawiał:
    </p>
    <p> <Ksiaze-Ramzes talking="true"/>
      — Gdyby bogowie, zamiast młodszym synem królewskim, uczynili mnie faraonem, podbiłbym dziewięć narodów…
    </p>
    <p> Książe <Ksiaze-Ramzes>Ramzes</Ksiaze-Ramzes> spojrzał na <Sara>Sarę</Sara>, a jego wzrok złagodniał. <Ksiaze-Ramzes>On</Ksiaze-Ramzes> był zamyślony. </p>
    <p> <Sara talking="true"/>
      — Panie mój, twe słowa są jak światło w ciemności — wyszeptała.
    </p>
    <p> Tekst bez postaci.
    </p>
</Chapter>
`;

// 1. Get the list of character tags
const characterTags = getCharacterTags(charactersXml);
console.log("Character Tags:", characterTags);

// 2. Analyze the generated chapter
const metadata = extractCharacterMetadata(generatedChapterXml, characterTags);

// 3. Output the result
console.log("Extracted Metadata:", JSON.stringify(metadata, null, 2));

/* Expected Output (approx):
[
  {
    "characterName": "Ksiaze-Ramzes",
    "infoPerChapter": [
      {
        "chapter": 1,
        "paragraphsWhereSpotted": [ 0, 2 ],
        "paragraphsWhereTalking": [ 1 ]
      }
    ]
  },
  {
    "characterName": "Nikotris",
    "infoPerChapter": [
      {
        "chapter": 1,
        "paragraphsWhereSpotted": [ 0 ],
        "paragraphsWhereTalking": []
      }
    ]
  },
  {
    "characterName": "Herhor",
    "infoPerChapter": [] // Not mentioned in this chapter
  },
  {
    "characterName": "Sara",
    "infoPerChapter": [
      {
        "chapter": 1,
        "paragraphsWhereSpotted": [ 2 ],
        "paragraphsWhereTalking": [ 3 ]
      }
    ]
  },
  {
    "characterName": "Tutmozis",
    "infoPerChapter": [] // Not mentioned in this chapter
  }
]
*/
