import { highlightCharacter } from "@player/ui/pageObserver";

export const activateCharacterInteractions = (element: HTMLElement, openCharacterDetailsModal: (characterSlug: string, isTalking: boolean, src: string) => void) => {
  setTimeout(() => {
    const characterSpan = element.querySelector<HTMLSpanElement>('.character-highlighted:not([data-click-listener-attached="true"])');
    const characterTalkingSpan = element.querySelector<HTMLSpanElement>('.character-talking:not([data-click-listener-attached="true"])');

    if (characterSpan && !characterTalkingSpan) {
      highlightCharacter(characterSpan, openCharacterDetailsModal);
    }
    if (characterTalkingSpan) {
      const characterSlug = characterTalkingSpan.dataset.character;
      const talkingSrc = characterTalkingSpan.dataset.srcTalking;

      const handler = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        openCharacterDetailsModal(characterSlug, true, talkingSrc);
      };
      characterTalkingSpan.addEventListener("pointerup", handler, { passive: false });
      // Mark to avoid re-attaching
      characterTalkingSpan.dataset.clickListenerAttached = "true";
    }
  }, 0);
};
