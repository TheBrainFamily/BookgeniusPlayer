import React, { useEffect, useRef } from "react";
import { BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import useLocalStorageState from "use-local-storage-state";
import { motion } from "motion/react";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { getAllVariants } from "@/genericBookDataGetters/getAllVariants";
import { replaceXmlTagsIntoHtmlTags } from "@/helpers/replaceXmlTagsIntoHtmlTags";
import { activateCharacterInteractions } from "@/helpers/activateCharacterInteractions";
import { useCharacterModal } from "@/stores/modals/characterModal.store";
import { OptionalElement } from "./OptionalElement";

type SentenceData = {
  id: string;
  analysis: { originalSentence: string; reasoning: string; score: number };
  simplifications: { reasoning: string; score: number; sentences: string[] }[];
};

interface ComplexitySliderProps {
  className?: string;
}

interface ChangeComplexityReadingEvent extends CustomEvent {
  detail: { complexity: number };
}

const ComplexitySlider: React.FC<ComplexitySliderProps> = ({ className }) => {
  const { t } = useTranslation();
  const allVariants = getAllVariants();
  const [currentComplexity, setCurrentComplexity] = useLocalStorageState("readingComplexity", { defaultValue: 100 });
  const isVisible = useRef(allVariants.length > 0);
  const { openModal: openCharacterDetailsModal } = useCharacterModal();

  useEffect(() => {
    const handleComplexityReadingChange = (event: ChangeComplexityReadingEvent) => {
      setCurrentComplexity(event.detail.complexity);
      localStorage.setItem("readingComplexity", event.detail.complexity.toString());
    };

    window.addEventListener("changeReadingComplexity", handleComplexityReadingChange);

    return () => {
      window.removeEventListener("changeReadingComplexity", handleComplexityReadingChange);
    };
  }, []);

  const handleComplexityChange = (value: number[]) => {
    const complexity = value[0];
    setCurrentComplexity(complexity);
    updateText(complexity);
  };

  const updateText = (currentLevel: number) => {
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

      // 3. Compare scores, not HTML strings!
      if (currentScore !== bestFit.score) {
        element.innerHTML = replaceXmlTagsIntoHtmlTags(textToDisplay);

        // 4. Update the state on the element!
        element.dataset.currentScore = bestFit.score.toString();

        // 5. Activate character interactions for newly transformed content
        activateCharacterInteractions(element, openCharacterDetailsModal);
      }
    }
  };

  const determineCorrectText = (currentLevel: number, sentenceData: SentenceData) => {
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
  };

  if (!isVisible.current) return null;

  return (
    <OptionalElement className={cn("transition-all duration-300 ease-out w-full flex justify-center", className)}>
      <motion.div
        className="bg-black/70 textured-bg border shadow-xl text-white border-white/30 w-full max-w-[400px] rounded-3xl px-4 py-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className={cn("p-3 rounded-lg bg-black/50 border border-white/20 transition-all duration-300")}>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-white" />
              <Label htmlFor="complexity-slider" className="text-sm font-medium text-white">
                {t("reading_complexity")}: <span className="text-blue-300">{currentComplexity}</span>
              </Label>
            </div>
            <Slider
              id="complexity-slider"
              variant="secondary"
              min={20}
              max={100}
              step={1}
              value={[currentComplexity]}
              onValueChange={handleComplexityChange}
              aria-label={t("reading_complexity")}
              className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-white/50"
            />
            <div className="flex justify-between text-xs text-gray-300">
              <span>{t("simple")}</span>
              <span>{t("medium")}</span>
              <span>{t("complex")}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </OptionalElement>
  );
};

export default ComplexitySlider;
