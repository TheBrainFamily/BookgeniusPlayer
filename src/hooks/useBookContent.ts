import { useEffect } from "react";
import { useCharacterModal } from "@/stores/modals/characterModal.store";
import { setupPageObserver } from "@/ui/pageObserver";
import { getBookStringified } from "@/genericBookDataGetters/getBookStringified";
import { getAllVariants } from "@/genericBookDataGetters/getAllVariants";
import { replaceXmlTagsIntoHtmlTags } from "@/helpers/replaceXmlTagsIntoHtmlTags";
import { activateCharacterInteractions } from "@/helpers/activateCharacterInteractions";
import { useSentenceModal } from "@/stores/modals/sentenceModal.store";
import { findSimplifiedSentence } from "@/helpers/findSimplifiedSentence";

type SentenceData = {
  id: string;
  analysis: { originalSentence: string; reasoning: string; score: number };
  simplifications: { reasoning: string; score: number; sentences: string[] }[];
};
export function useBookContent(containerId: string) {
  const bookStringified = getBookStringified();
  const allVariants = getAllVariants();

  const { openModal: openCharacterDetailsModal } = useCharacterModal();
  const { openModal: openSentenceModal } = useSentenceModal();

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = bookStringified.replace(/<\/section>(?!.*<\/section>)/s, '<div style="height: 50vh;"></div></section>');
      setupPageObserver(openCharacterDetailsModal);

      const allSpans = container.querySelectorAll("span");
      const regex = /^ch\d+-p\d+-s\d+$/;
      const matchingSpans = Array.from(allSpans).filter((span) => regex.test(span.id));

      matchingSpans.forEach((span) => {
        span.addEventListener("click", (event) => {
          const target = event.target as HTMLInputElement;
          const currentSentenceId = target.id;
          const currentSentence = target.textContent;
          const currentSentenceScore = target.getAttribute("data-current-score");
          const { text: simplifiedSentence, score: simplifiedSentenceScore } = findSimplifiedSentence(target.id, parseInt(currentSentenceScore));
          openSentenceModal(currentSentence, simplifiedSentence, currentSentenceId, simplifiedSentenceScore);
        });
      });

      // --- PART B: Slider Interaction ---
      const slider = document.getElementById("complexity-slider");

      if (allVariants.length === 0) {
        console.warn("No variants found. Complexity Slider will be hidden.");
        slider.parentElement.style.display = "none";
        return;
      }

      slider.addEventListener("input", (event: Event) => {
        const currentLevel = parseInt((event.target as HTMLInputElement).value, 10); // A value from 20-100
        console.log("currentLevel", currentLevel);
        updateText(currentLevel);
      });

      // --- PART C: The Update Function ---

      function updateText(currentLevel) {
        for (const sentenceData of allVariants) {
          const element = document.getElementById(sentenceData.id);
          if (!element) {
            continue;
          }

          // 1. Get the entire best-fit object { score, text }
          const bestFit = determineCorrectText(currentLevel, sentenceData);

          // In case the variant text is an array of sentences
          const textToDisplay = bestFit.text;

          // 2. Read the current score from the element's data attribute
          const currentScore = parseInt(element.dataset.currentScore, 10) || sentenceData.analysis.score;

          // 3. **THE NEW COMPARISON:** Compare scores, not HTML strings!
          if (currentScore !== bestFit.score) {
            element.innerHTML = replaceXmlTagsIntoHtmlTags(textToDisplay);

            // 4. **CRITICAL:** Update the state on the element!
            element.dataset.currentScore = bestFit.score.toString();

            // 5. Activate character interactions for newly transformed content
            activateCharacterInteractions(element, openCharacterDetailsModal);
          }
        }
      }
      function determineCorrectText(currentLevel: number, sentenceData: SentenceData) {
        const allVersions = [
          { score: sentenceData.analysis.score, text: sentenceData.analysis.originalSentence },
          ...sentenceData.simplifications.map((s) => ({ score: s.score, text: s.sentences.join(" ") })),
        ];

        allVersions.sort((a, b) => b.score - a.score);

        let bestFit = allVersions.find((version) => version.score <= currentLevel);

        if (!bestFit) {
          bestFit = allVersions[allVersions.length - 1];
        }

        return bestFit;
      }
    } else {
      console.warn(`Container with id '${containerId}' not found for content injection.`);
    }
  }, [bookStringified, containerId]); // Rerun if content or ID changes
}
