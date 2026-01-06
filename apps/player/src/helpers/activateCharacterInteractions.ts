import { highlightCharacter } from "@player/ui/highlightCharacter";

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
