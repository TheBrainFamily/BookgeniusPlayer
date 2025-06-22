import { useEffect } from "react";
import { useCharacterModal } from "@/stores/modals/characterModal.store";
import { setupPageObserver } from "@/ui/pageObserver";
import { getBookStringified } from "@/genericBookDataGetters/getBookStringified";
import { useSentenceModal } from "@/stores/modals/sentenceModal.store";
import { findSimplifiedSentence } from "@/helpers/findSimplifiedSentence";

export function useBookContent(containerId: string) {
  const bookStringified = getBookStringified();

  const { openModal: openCharacterDetailsModal } = useCharacterModal();
  const { openModal: openSentenceModal } = useSentenceModal();

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = bookStringified.replace(/<\/section>(?!.*<\/section>)/s, '<div style="height: 50vh;"></div></section>');
      setupPageObserver(openCharacterDetailsModal);

      container.addEventListener("click", (event) => {
        const target = event.target as HTMLInputElement;
        if (target.tagName === "SPAN" && /^ch\d+-p\d+-s\d+$/.test(target.id)) {
          const currentSentenceId = target.id;
          const currentSentence = target.textContent;
          const currentSentenceScore = target.getAttribute("data-current-score");
          const { text: simplifiedSentence, score: simplifiedSentenceScore } = findSimplifiedSentence(target.id, parseInt(currentSentenceScore));
          openSentenceModal(currentSentence, simplifiedSentence, currentSentenceId, simplifiedSentenceScore);
        }
      });
    } else {
      console.warn(`Container with id '${containerId}' not found for content injection.`);
    }
  }, [bookStringified, containerId]); // Rerun if content or ID changes
}
