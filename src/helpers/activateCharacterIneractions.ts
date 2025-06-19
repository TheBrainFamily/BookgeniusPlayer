// Function to activate character interactions for newly transformed content
import { highlightCharacter } from "@/ui/pageObserver";

export const activateCharacterInteractions = (element: HTMLElement, openCharacterDetailsModal: (characterSlug: string, isTalking: boolean, src: string) => void) => {
  // Use setTimeout to ensure DOM has been updated with the new content
  setTimeout(() => {
    // Find all character-highlighted spans that don't have event listeners yet
    const characterSpans = element.querySelectorAll<HTMLSpanElement>('.character-highlighted:not([data-click-listener-attached="true"])');

    // Apply highlighting to all found spans using the proper highlightCharacter function
    characterSpans.forEach((span) => {
      highlightCharacter(span, openCharacterDetailsModal);
    });

    if (characterSpans.length > 0) {
      console.log(`Activated character interactions for ${characterSpans.length} spans`);
    }
  }, 0);
};
