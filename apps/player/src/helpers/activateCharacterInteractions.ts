import { CharacterModalParams } from "@player/stores/modals/characterModal.store";
import { getCharactersData } from "@player/state/bookDataStore";
import { highlightCharacter } from "@player/ui/highlightCharacter";
import {
  resolveCharacterSnapshot,
  parseChapterParagraphId,
} from "@player/utils/characterOverrides";
import type { CharacterData, ChapterParagraphRef } from "@player/types/book";
import { isVideoFile } from "@player/helpers/isVideoFile";

// Get character data by slug - always fresh from store (no stale cache)
function getCharacterDataBySlug(slug: string): CharacterData | undefined {
  const characters = getCharactersData();
  // Case-insensitive matching (XML tags may differ in case from Convex slugs)
  return characters.find((c) => c.slug.toLowerCase() === slug.toLowerCase());
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
  const characterSpans = element.querySelectorAll<HTMLSpanElement>(
    '.character-highlighted:not([data-click-listener-attached="true"])',
  );

  const alreadyHighlighted = [];

  characterSpans.forEach((characterSpan) => {
    const characterSlug = characterSpan.dataset.character;

    if (alreadyHighlighted.includes(characterSlug)) return;

    highlightCharacter(characterSpan);
    alreadyHighlighted.push(characterSlug);
  });
};
