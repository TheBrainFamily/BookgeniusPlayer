import { useMemo } from "react";
import type { Location } from "@/state/LocationContext";
import type { CharacterData } from "@/types/book";

/**
 * Custom hook to determine which characters are currently speaking based on the current location
 * @param location - Current location in the book (chapter and paragraph)
 * @param allCharacters - Array of all character data
 * @param isPlayFormat - Whether the book is in play format or not
 * @returns Array of character slugs who are currently speaking
 */
export function useCurrentSpeakers(location: Location, allCharacters: CharacterData[], isPlayFormat: boolean): string[] {
  return useMemo(() => {
    if (!location.currentChapter || !location.currentParagraph) {
      return [];
    }

    const currentChapter = location.currentChapter;
    const currentParagraph = location.currentParagraph;

    // Use cached character data and filter only once
    const characterChapterData = allCharacters.map((char) => {
      const chapterInfo = char.infoPerChapter.find((ch) => ch.chapter === currentChapter);
      return { slug: char.slug, paragraphsWhereTalking: chapterInfo?.paragraphsWhereTalking || [] };
    });

    if (!isPlayFormat) {
      // For book format, the speakers are ONLY those talking in the current paragraph.
      const whoIsTalkingNow = characterChapterData.filter((char) => char.paragraphsWhereTalking.includes(currentParagraph));
      return whoIsTalkingNow.map((char) => char.slug);
    }

    // For play format, apply sticky logic.
    const whoStartsTalkingNow = characterChapterData.filter((char) => char.paragraphsWhereTalking.includes(currentParagraph));

    if (whoStartsTalkingNow.length > 0) {
      return whoStartsTalkingNow.map((char) => char.slug);
    }

    let mostRecentSpeakers: string[] = [];
    let mostRecentParagraph = -1;

    characterChapterData.forEach((char) => {
      const mostRecentForThisChar = char.paragraphsWhereTalking.reduce((max, p) => (p <= currentParagraph ? Math.max(max, p) : max), -1);

      if (mostRecentForThisChar !== -1) {
        if (mostRecentForThisChar > mostRecentParagraph) {
          mostRecentParagraph = mostRecentForThisChar;
          mostRecentSpeakers = [char.slug];
        } else if (mostRecentForThisChar === mostRecentParagraph) {
          mostRecentSpeakers.push(char.slug);
        }
      }
    });
    return mostRecentSpeakers;
  }, [location.currentChapter, location.currentParagraph, allCharacters, isPlayFormat]);
}
