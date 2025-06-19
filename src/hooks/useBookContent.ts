import { useEffect } from "react";
import { useCharacterModal } from "@/stores/modals/characterModal.store";
import { setupPageObserver } from "@/ui/pageObserver";
import { getBookStringified } from "@/genericBookDataGetters/getBookStringified";
import { allVariants } from "@/allVariants";

type SentenceData = {
  id: string;
  analysis: { originalSentence: string; reasoning: string; score: number };
  simplifications: { reasoning: string; score: number; sentences: string[] }[];
};
export function useBookContent(containerId: string) {
  const bookStringified = getBookStringified();
  const { openModal: openCharacterDetailsModal } = useCharacterModal();

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = bookStringified.replace(/<\/section>(?!.*<\/section>)/s, '<div style="height: 50vh;"></div></section>');
      setupPageObserver(openCharacterDetailsModal);

      // --- PART B: Slider Interaction ---
      const slider = document.getElementById("complexity-slider");

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
            element.innerHTML = textToDisplay;

            // 4. **CRITICAL:** Update the state on the element!
            element.dataset.currentScore = bestFit.score.toString();
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
