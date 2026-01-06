/**
 * Browser-compatible character extraction from XML.
 *
 * Extracts character appearance information (when they talk, are spotted, etc.)
 * from the book XML for use in the player's character display system.
 */

// =============================================================================
// Types
// =============================================================================

export interface ChapterInfo {
  chapter: number;
  summary: string;
  paragraphsWhereSpotted: number[];
  paragraphsWhereTalking: number[];
  paragraphsWhereEnters?: number[];
  paragraphsWhereExits?: number[];
}

export interface CharacterOverrideMetadata {
  from: { chapter: number; paragraph: number };
  to?: { chapter: number; paragraph: number };
  summary?: string;
  display?: string;
  avatar?: string;
}

export interface SimpleCharacterMetadata {
  slug: string;
  characterName: string;
  bookSlug: string;
  infoPerChapter: ChapterInfo[];
  overrides?: CharacterOverrideMetadata[];
  media?: { avatarUrl?: string; listensUrl?: string; speaksUrl?: string };
}

/** Character bundle info passed from Convex */
export interface CharacterBundleForExtractor {
  slug: string;
  name: string;
  extra: { displayName?: string; summary?: string };
  avatar?: { url: string };
  listens?: { url: string };
  speaks?: { url: string };
}

enum ListType {
  SPOTTED = "spotted",
  TALKING = "talking",
  ENTERS = "enters",
  EXITS = "exits",
}

// =============================================================================
// Helper Functions
// =============================================================================

const isElementNode = (node: Node): node is Element => node.nodeType === 1;

const OVERRIDE_REF_REGEX = /^ch(\d+)-p(\d+)$/i;

const parseChapterParagraphRef = (
  ref?: string | null,
): { chapter: number; paragraph: number } | null => {
  if (!ref) return null;
  const normalized = ref.trim();
  const match = normalized.match(OVERRIDE_REF_REGEX);
  if (!match) {
    console.warn(`[characterExtractor] Invalid chapter/paragraph reference: "${ref}"`);
    return null;
  }

  const chapter = Number.parseInt(match[1], 10);
  const paragraph = Number.parseInt(match[2], 10);

  if (Number.isNaN(chapter) || Number.isNaN(paragraph)) {
    console.warn(
      `[characterExtractor] Unable to parse chapter/paragraph numbers from reference: "${ref}"`,
    );
    return null;
  }

  return { chapter, paragraph };
};

const collectOverridesFromCharacterElement = (element: Element): CharacterOverrideMetadata[] => {
  const overrides: CharacterOverrideMetadata[] = [];

  for (let i = 0; i < element.childNodes.length; i++) {
    const node = element.childNodes[i];
    if (!isElementNode(node)) continue;

    const tagName = node.tagName.toLowerCase();

    if (tagName !== "override" && tagName !== "overwrite") continue;

    const fromRef = parseChapterParagraphRef(node.getAttribute("from"));
    if (!fromRef) {
      console.warn(
        `[characterExtractor] Skipping override for ${element.tagName} due to missing or invalid "from" attribute.`,
      );
      continue;
    }

    const toRef = parseChapterParagraphRef(node.getAttribute("to")) ?? undefined;
    const summary = node.getAttribute("summary") || undefined;
    const display = node.getAttribute("display") || undefined;
    const avatar = node.getAttribute("avatar") || undefined;

    if (!summary && !display && !avatar && !toRef) {
      console.warn(
        `[characterExtractor] Override for ${element.tagName} at ${node.getAttribute("from") || "unknown"} has no payload; skipping.`,
      );
      continue;
    }

    overrides.push({ from: fromRef, to: toRef, summary, display, avatar });
  }

  return overrides;
};

// =============================================================================
// Public Functions
// =============================================================================

/**
 * Extract character tags from CharactersMaster element.
 */
export function getCharacterTags(doc: Document): Set<string> {
  const characterTags = new Set<string>();
  try {
    const masterElement = doc.getElementsByTagName("CharactersMaster")[0];

    if (!masterElement) {
      console.warn("Could not find <CharactersMaster> element.");
      return characterTags;
    }

    for (let i = 0; i < masterElement.childNodes.length; i++) {
      const node = masterElement.childNodes[i];
      if (isElementNode(node)) {
        characterTags.add(node.tagName);
      }
    }
  } catch (error) {
    console.error("Error parsing CharactersMaster XML:", error);
  }
  return characterTags;
}

/**
 * Get character overrides from CharactersMaster.
 */
export function getCharacterOverrides(doc: Document): Map<string, CharacterOverrideMetadata[]> {
  const overridesMap = new Map<string, CharacterOverrideMetadata[]>();

  try {
    const masterElement = doc.getElementsByTagName("CharactersMaster")[0];

    if (!masterElement) {
      return overridesMap;
    }

    for (let i = 0; i < masterElement.childNodes.length; i++) {
      const node = masterElement.childNodes[i];
      if (!isElementNode(node)) continue;

      const overrides = collectOverridesFromCharacterElement(node);
      if (overrides.length > 0) {
        overridesMap.set(node.tagName, overrides);
      }
    }
  } catch (error) {
    console.error("Error parsing character overrides:", error);
  }

  return overridesMap;
}

const getSummaryForCharacter = (
  slug: string,
  bundlesBySlug: Map<string, CharacterBundleForExtractor>,
): string => {
  const bundle = bundlesBySlug.get(slug.toLowerCase());
  if (!bundle) {
    throw new Error(`Character bundle not found for slug: ${slug}`);
  }
  return bundle.extra.summary ?? "";
};

const getDisplayForCharacter = (
  slug: string,
  bundlesBySlug: Map<string, CharacterBundleForExtractor>,
): string => {
  const bundle = bundlesBySlug.get(slug.toLowerCase());
  if (!bundle) {
    throw new Error(`Character bundle not found for slug: ${slug}`);
  }
  return bundle.extra.displayName ?? bundle.name;
};

/**
 * Extract character metadata from a parsed XML document.
 *
 * This function scans all chapters and paragraphs to find character mentions,
 * talking parts, enters/exits, etc.
 *
 * @param doc - Parsed XML document
 * @param characterTags - Set of known character tag names
 * @param bookForm - Book format ("play", "mixed", or "prose")
 * @param bookSlug - Book's slug identifier
 * @param characterBundles - Character bundle data from Convex (for display names and summaries)
 * @param characterOverrides - Optional override data per character
 */
export function extractCharacterMetadata(
  doc: Document,
  characterTags: Set<string>,
  bookForm: string,
  bookSlug: string,
  characterBundles: CharacterBundleForExtractor[],
  characterOverrides?: Map<string, CharacterOverrideMetadata[]>,
): SimpleCharacterMetadata[] {
  const resultsMap = new Map<string, SimpleCharacterMetadata>();

  const bundlesBySlug = new Map<string, CharacterBundleForExtractor>();
  for (const bundle of characterBundles) {
    bundlesBySlug.set(bundle.slug.toLowerCase(), bundle);
  }

  characterTags.forEach((tag) => {
    const slugLower = tag.toLowerCase();
    const bundle = bundlesBySlug.get(slugLower);
    const base: SimpleCharacterMetadata = {
      slug: slugLower,
      characterName: getDisplayForCharacter(tag, bundlesBySlug),
      bookSlug,
      infoPerChapter: [],
      media: {
        avatarUrl: bundle?.avatar?.url,
        listensUrl: bundle?.listens?.url,
        speaksUrl: bundle?.speaks?.url,
      },
    };

    const overrides = characterOverrides?.get(tag);
    if (overrides && overrides.length > 0) {
      base.overrides = overrides;
    }

    resultsMap.set(slugLower, base);
  });

  try {
    const parseError = doc.getElementsByTagName("parsererror")[0];
    if (parseError) {
      console.error("Error parsing generated chapter XML:", parseError.textContent);
      return [];
    }

    const chapterElements = doc.getElementsByTagName("Chapter");
    if (chapterElements.length === 0) {
      console.warn("No <Chapter> elements found in the generated XML.");
      return [];
    }

    for (let chapterIndex = 0; chapterIndex < chapterElements.length; chapterIndex++) {
      const chapterElement = chapterElements[chapterIndex];

      const chapterIdAttr = chapterElement.getAttribute("id");
      if (!chapterIdAttr || isNaN(parseInt(chapterIdAttr, 10))) {
        console.warn(
          `Chapter element at index ${chapterIndex} is missing or has an invalid ID. Skipping.`,
        );
        continue;
      }
      const chapterId = parseInt(chapterIdAttr, 10);

      let dataIndex = 0;

      for (let j = 0; j < chapterElement.childNodes.length; j++) {
        const node = chapterElement.childNodes[j];

        if (isElementNode(node)) {
          const paragraph = node;
          const spottedInPara = new Set<string>();
          const talksInPara = new Set<string>();
          const entersInPara = new Set<string>();
          const exitsInPara = new Set<string>();

          const allDescendants = paragraph.getElementsByTagName("*");
          for (let i = 0; i < allDescendants.length; i++) {
            const childNode = allDescendants[i];

            if (isElementNode(childNode)) {
              const tagName = childNode.tagName;

              if (characterTags.has(tagName)) {
                if (childNode.getAttribute("dynasty") === "true") continue;

                if (childNode.getAttribute("enters") === "true") {
                  entersInPara.add(tagName);
                } else if (childNode.getAttribute("exits") === "true") {
                  exitsInPara.add(tagName);
                }

                if (childNode.getAttribute("talking") === "true") {
                  talksInPara.add(tagName);
                } else {
                  spottedInPara.add(tagName);
                }
              }
            }
          }

          const updateCharacterInfo = (charTag: string, listType: ListType) => {
            const data = resultsMap.get(charTag.toLowerCase());
            if (!data) return;

            let chapterEntry = data.infoPerChapter.find((info) => info.chapter === chapterId);
            if (!chapterEntry) {
              chapterEntry = {
                chapter: chapterId,
                summary: getSummaryForCharacter(charTag, bundlesBySlug),
                paragraphsWhereSpotted: [],
                paragraphsWhereTalking: [],
              };
              if (bookForm === "play" || bookForm === "mixed") {
                chapterEntry.paragraphsWhereEnters = [];
                chapterEntry.paragraphsWhereExits = [];
              }
              data.infoPerChapter.push(chapterEntry);
              data.infoPerChapter.sort((a, b) => a.chapter - b.chapter);
            }

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
      }
    }

    resultsMap.forEach((data) => {
      data.infoPerChapter.forEach((chapterInfo) => {
        chapterInfo.paragraphsWhereSpotted.sort((a, b) => a - b);
        chapterInfo.paragraphsWhereTalking.sort((a, b) => a - b);
        if (bookForm === "play" || bookForm === "mixed") {
          chapterInfo.paragraphsWhereEnters?.sort((a, b) => a - b);
          chapterInfo.paragraphsWhereExits?.sort((a, b) => a - b);
        }
      });
    });

    return Array.from(resultsMap.values());
  } catch (error) {
    console.error("Error analyzing generated chapter XML:", error);
    return [];
  }
}
