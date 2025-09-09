import { useMemo } from "react";
import { useLocation } from "@player/state/LocationContext";
import { CharacterData } from "@player/types/book";

export function useCharactersOnStage(allCharacters: CharacterData[]): CharacterData[] {
  const { location } = useLocation();

  const charactersOnStage = useMemo(() => {
    if (!location?.currentChapter || !location?.currentParagraph) return [];

    const { currentChapter, currentParagraph } = location;

    return allCharacters.filter((character) => {
      const info = character.infoPerChapter.find((info) => info.chapter === currentChapter);
      if (!info) return false;

      const enters = info.paragraphsWhereEnters ?? [];
      const exits = info.paragraphsWhereExits ?? [];

      if (enters.length === 0) return false;

      let isCurrentlyOnStage = false;
      let lastEnterParagraph: number | null = null;

      for (const enterParagraph of enters) {
        if (currentParagraph >= enterParagraph) {
          lastEnterParagraph = enterParagraph;
        } else {
          break;
        }
      }

      if (lastEnterParagraph === null) {
        return false;
      }

      const correspondingExit = exits.find((exitParagraph) => exitParagraph > lastEnterParagraph!);
      if (correspondingExit === undefined || currentParagraph < correspondingExit) {
        isCurrentlyOnStage = true;
      }

      return isCurrentlyOnStage;
    });
  }, [location, allCharacters]);

  return charactersOnStage;
}
