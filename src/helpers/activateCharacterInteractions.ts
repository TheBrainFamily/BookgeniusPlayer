import { highlightCharacter } from "@/ui/pageObserver";

export const activateCharacterInteractions = (element: HTMLElement, openCharacterDetailsModal: (characterSlug: string, isTalking: boolean, src: string) => void) => {
  setTimeout(() => {
    const characterSpan = element.querySelector<HTMLSpanElement>('.character-highlighted:not([data-click-listener-attached="true"])');

    if (characterSpan) {
      highlightCharacter(characterSpan, openCharacterDetailsModal);
      console.log(`Activated character interaction for one span`);
    }
  }, 0);
};
