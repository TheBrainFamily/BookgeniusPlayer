import { pharaonCharactersData } from "./pharaon-apr-28.charactersmetadatas";
type CharactersMetadataType = {
  characterName: string;
  bookSlug: "Pharaon";
  infoPerChapter: { chapter: number; summary: string; label?: string; paragraphsWhereSpotted: number[]; paragraphsWhereTalking: number[] }[];
  imageUrl: string;
};

const findDuplicatedTalking = (charactersMetadata: CharactersMetadataType[]) => {
  // Map to store conflicts: key = "chapter-paragraph", value = { chapter, paragraph, characters Set }
  const conflicts = new Map<string, { chapter: number; paragraph: number; characters: Set<string> }>();

  // Iterate through unique pairs of characters
  for (let i = 0; i < charactersMetadata.length; i++) {
    const charA = charactersMetadata[i];

    for (let j = i + 1; j < charactersMetadata.length; j++) {
      const charB = charactersMetadata[j];

      // Create maps of chapter -> paragraphsWhereTalking for efficient lookup
      const charAChapters = new Map(charA.infoPerChapter.map((info) => [info.chapter, info.paragraphsWhereTalking]));
      const charBChapters = new Map(charB.infoPerChapter.map((info) => [info.chapter, info.paragraphsWhereTalking]));

      // Find chapters where both characters have entries
      const commonChapters = [...charAChapters.keys()].filter((chapter) => charBChapters.has(chapter));

      for (const chapter of commonChapters) {
        const paragraphsA = new Set(charAChapters.get(chapter) || []);
        const paragraphsB = charBChapters.get(chapter) || [];

        // Skip if character A isn't talking in this chapter
        if (paragraphsA.size === 0) continue;

        // Check for overlap in talking paragraphs
        for (const paragraph of paragraphsB) {
          if (paragraphsA.has(paragraph)) {
            // Conflict found
            const conflictKey = `${chapter}-${paragraph}`;
            if (!conflicts.has(conflictKey)) {
              conflicts.set(conflictKey, { chapter: chapter, paragraph: paragraph, characters: new Set<string>() });
            }
            // Add both characters involved in this specific conflict instance
            conflicts.get(conflictKey)!.characters.add(charA.characterName);
            conflicts.get(conflictKey)!.characters.add(charB.characterName);
          }
        }
      }
    }
  }

  // Report the findings
  if (conflicts.size > 0) {
    console.log("Found conflicts where multiple characters talk in the same paragraph:");
    conflicts.forEach((conflict) => {
      console.log(`  Chapter ${conflict.chapter}, Paragraph ${conflict.paragraph}: ${[...conflict.characters].join(", ")}`);
    });
  } else {
    console.log("No conflicts found. No paragraphs have multiple characters talking simultaneously.");
  }

  // Return the identified conflicts
  return Array.from(conflicts.values()).map((c) => ({ ...c, characters: Array.from(c.characters) }));
};

findDuplicatedTalking(pharaonCharactersData as CharactersMetadataType[]);
