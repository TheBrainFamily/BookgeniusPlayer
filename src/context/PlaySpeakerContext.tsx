import React, { createContext, useContext, useMemo, ReactNode } from "react";
import { useLocation } from "@/state/LocationContext";
import { getBookData } from "@/genericBookDataGetters/getBookData";
import { getCharactersData } from "@/genericBookDataGetters/getCharactersData";

interface PlaySpeakerContextType {
  currentSpeakers: string[];
  isPlayFormat: boolean;
}

const PlaySpeakerContext = createContext<PlaySpeakerContextType | undefined>(undefined);

interface PlaySpeakerProviderProps {
  children: ReactNode;
}

export const PlaySpeakerProvider: React.FC<PlaySpeakerProviderProps> = ({ children }) => {
  const { location } = useLocation();

  const contextValue = useMemo(() => {
    const bookData = getBookData();
    const isPlayFormat = bookData.metadata.bookForm === "play";

    if (!isPlayFormat) {
      return { currentSpeakers: [], isPlayFormat: false };
    }

    const currentChapter = location.currentChapter;
    const currentParagraph = location.currentParagraph;

    // Get all characters data
    const allCharacters = getCharactersData();

    // Find chapter data for current chapter
    const currentChapterData = allCharacters.map((char) => {
      const chapterInfo = char.infoPerChapter.find((ch) => ch.chapter === currentChapter);
      return { slug: char.slug, paragraphsWhereTalking: chapterInfo?.paragraphsWhereTalking || [] };
    });

    // Check if anyone starts talking in the current paragraph
    const whoStartsTalkingNow = currentChapterData.filter((char) => char.paragraphsWhereTalking.includes(currentParagraph));

    if (whoStartsTalkingNow.length > 0) {
      // Multiple people can start talking in current paragraph - allow all of them
      return { currentSpeakers: whoStartsTalkingNow.map((char) => char.slug), isPlayFormat: true };
    }

    // Nobody starts talking in current paragraph - find who was talking most recently
    let mostRecentSpeakers: string[] = [];
    let mostRecentParagraph = -1;

    currentChapterData.forEach((char) => {
      // Find the most recent paragraph where this character started talking
      // that is before or equal to the current paragraph. Use reduce for efficiency.
      const mostRecentForThisChar = char.paragraphsWhereTalking.filter((p) => p <= currentParagraph).reduce((max, p) => Math.max(max, p), -1);

      if (mostRecentForThisChar !== -1) {
        if (mostRecentForThisChar > mostRecentParagraph) {
          mostRecentParagraph = mostRecentForThisChar;
          mostRecentSpeakers = [char.slug];
        } else if (mostRecentForThisChar === mostRecentParagraph) {
          mostRecentSpeakers.push(char.slug);
        }
      }
    });

    return { currentSpeakers: mostRecentSpeakers, isPlayFormat: true };
  }, [location.currentChapter, location.currentParagraph]);

  return <PlaySpeakerContext.Provider value={contextValue}>{children}</PlaySpeakerContext.Provider>;
};

export const usePlaySpeaker = (): PlaySpeakerContextType => {
  const context = useContext(PlaySpeakerContext);
  if (context === undefined) {
    throw new Error("usePlaySpeaker must be used within a PlaySpeakerProvider");
  }
  return context;
};
