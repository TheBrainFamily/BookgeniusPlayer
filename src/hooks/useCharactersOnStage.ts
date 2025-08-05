import { useMemo } from "react";
import { getCharactersData } from "@/genericBookDataGetters/getCharactersData";
import { useLocation } from "@/state/LocationContext";
import { CharacterData } from "@/types/book";

export function useCharactersOnStage(): CharacterData[] {
  const { location } = useLocation();
  const allCharacters = useMemo(() => getCharactersData(), []);

  const charactersOnStage = useMemo(() => {
    if (!location) return [];

    const { chapter: currentChapter, paragraph: currentParagraph } = location;

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
