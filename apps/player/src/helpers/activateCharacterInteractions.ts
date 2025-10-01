import { CharacterModalParams } from "@player/stores/modals/characterModal.store";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { highlightCharacter } from "@player/ui/highlightCharacter";
import { resolveCharacterSnapshot, parseChapterParagraphId } from "@player/utils/characterOverrides";
import type { CharacterData, ChapterParagraphRef } from "@player/types/book";
import { isVideoFile } from "@player/helpers/isVideoFile";

const charactersBySlug = new Map<string, CharacterData>();

function getCharacterDataBySlug(slug: string): CharacterData | undefined {
  if (!charactersBySlug.has(slug)) {
    charactersBySlug.clear();
    getCharactersData().forEach((character) => charactersBySlug.set(character.slug, character));
  }

  return charactersBySlug.get(slug);
}

function extractLocationFromElement(el: HTMLElement): ChapterParagraphRef | null {
  const sentenceSpan = el.closest<HTMLSpanElement>("span[id^='ch']");
  const fromId = parseChapterParagraphId(sentenceSpan?.id);
  if (fromId) {
    return fromId;
  }

  const paragraphEl = el.closest<HTMLElement>("[data-index]");
  if (!paragraphEl) {
    return null;
  }

  const chapterSection = paragraphEl.closest<HTMLElement>("section[data-chapter]");
  if (!chapterSection) {
    return null;
  }

  const chapter = Number.parseInt(chapterSection.dataset.chapter ?? "", 10);
  const paragraph = Number.parseInt(paragraphEl.dataset.index ?? "", 10);

  if (Number.isNaN(chapter) || Number.isNaN(paragraph)) {
    return null;
  }

  return { chapter, paragraph };
}

export const activateCharacterInteractions = (element: HTMLElement) => {
  setTimeout(() => {
    const characterSpan = element.querySelector<HTMLSpanElement>('.character-highlighted:not([data-click-listener-attached="true"])');
    const characterTalkingSpan = element.querySelector<HTMLSpanElement>('.character-talking:not([data-click-listener-attached="true"])');

    if (characterSpan && !characterTalkingSpan) {
      highlightCharacter(characterSpan);
    }
  }, 0);
};
