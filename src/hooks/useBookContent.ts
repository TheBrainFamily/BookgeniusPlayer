import { useEffect } from "react";
import { useCharacterModal } from "@/stores/modals/characterModal.store";
import { setupPageObserver } from "@/ui/pageObserver";
import { getBookStringified } from "@/genericBookDataGetters/getBookStringified";
import { useSentenceModal } from "@/stores/modals/sentenceModal.store";
import { findSimplifiedSentence } from "@/helpers/findSimplifiedSentence";
import { replaceXmlTagsIntoHtmlTags } from "@/helpers/replaceXmlTagsIntoHtmlTags";
import { activateCharacterInteractions } from "@/helpers/activateCharacterInteractions";

export function useBookContent(containerId: string) {
  const bookStringified = getBookStringified();

  const { openModal: openCharacterDetailsModal } = useCharacterModal();
  const { openModal: openSentenceModal } = useSentenceModal();

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = bookStringified.replace(/<\/section>(?!.*<\/section>)/s, '<div style="height: 50vh;"></div></section>');
      setupPageObserver(openCharacterDetailsModal);

      const handleClick = (event) => {
        const target = event.target as HTMLElement;

        if (target.closest(".character-highlighted-activated")) {
          return;
        }

        // If the icon was clicked, let its own handler deal with it and don't simplify further.
        if (target.closest(".simplified-icon")) {
          return;
        }

        const span = target.closest("span[id^='ch']");

        if (span) {
          const isFirstSimplification = !span.hasAttribute("data-simplified");

          // Store the original sentence only on the first click.
          if (isFirstSimplification) {
            span.setAttribute("data-original-sentence", span.innerHTML);
          }

          const currentSentenceId = span.id;
          const currentSentenceScore = span.getAttribute("data-current-score") || "0";
          const { text: simplifiedSentence, score: simplifiedSentenceScore } = findSimplifiedSentence(span.id, parseInt(currentSentenceScore));

          if (!simplifiedSentence) {
            console.warn(`No further simplification available for ${currentSentenceId}`);
            // We can add a visual cue here later if needed.
            return;
          }

          // Remove old icon if it exists before updating innerHTML
          const existingIcon = span.querySelector(".simplified-icon");
          if (existingIcon) {
            span.removeChild(existingIcon);
          }

          span.innerHTML = replaceXmlTagsIntoHtmlTags(simplifiedSentence);
          span.setAttribute("data-current-score", simplifiedSentenceScore.toString());
          span.setAttribute("data-simplified", "true");

          activateCharacterInteractions(span as HTMLElement, openCharacterDetailsModal);

          const iconContainer = document.createElement("span");
          iconContainer.className = "simplified-icon";
          iconContainer.style.marginLeft = "5px";
          iconContainer.style.cursor = "pointer";
          iconContainer.style.display = "inline-block";
          iconContainer.style.verticalAlign = "middle";
          iconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="ForestGreen" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`;
          span.appendChild(iconContainer);

          iconContainer.onclick = (e) => {
            e.stopPropagation();
            const originalSentence = span.getAttribute("data-original-sentence");
            // The `simplifiedSentence` variable holds the text for the *current* simplified version.
            openSentenceModal(originalSentence, simplifiedSentence, currentSentenceId, simplifiedSentenceScore);
          };
        }
      };

      const handleMouseOver = (event: MouseEvent) => {
        const span = (event.target as HTMLElement).closest("span");

        if (span && /^ch\d+-p\d+-s\d+$/.test(span.id)) {
          span.style.backgroundColor = "rgba(66, 68, 90, 0.1)";
          span.style.padding = "0.2rem 0";
          span.style.cursor = "pointer";
        }
      };

      const handleMouseOut = (event: MouseEvent) => {
        const span = (event.target as HTMLElement).closest("span");
        if (span && /^ch\d+-p\d+-s\d+$/.test(span.id)) {
          span.style.backgroundColor = "transparent";
          span.style.padding = "0";
          span.style.cursor = "default";
        }
      };

      container.addEventListener("click", handleClick);
      container.addEventListener("mouseover", handleMouseOver);
      container.addEventListener("mouseout", handleMouseOut);

      return () => {
        container.removeEventListener("click", handleClick);
        container.removeEventListener("mouseover", handleMouseOver);
        container.removeEventListener("mouseout", handleMouseOut);
      };
    } else {
      console.warn(`Container with id '${containerId}' not found for content injection.`);
    }
  }, [bookStringified, containerId]); // Rerun if content or ID changes
}
