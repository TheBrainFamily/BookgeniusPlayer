import React, { useEffect, useState, useRef } from "react";
import { List, Type, RotateCcw, BrainCircuit, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import useLocalStorageState from "use-local-storage-state";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import ModalUI from "./ModalUI";
import { activateCharacterInteractions } from "@/helpers/activateCharacterInteractions";
import { replaceXmlTagsIntoHtmlTags } from "@/helpers/replaceXmlTagsIntoHtmlTags";
import { getAllVariants } from "@/genericBookDataGetters/getAllVariants";
import { useCharacterModal } from "@/stores/modals/characterModal.store";

type SentenceData = {
  id: string;
  analysis: { originalSentence: string; reasoning: string; score: number };
  simplifications: { reasoning: string; score: number; sentences: string[] }[];
};

interface BookMenuModalProps {
  onClose: () => void;
  openBookChapterModal: () => void;
  openApiKeyModal: () => void;
  resetFurthestPageLocation: () => void;
}

const SLIDER_DELAY = 200;
const OVERLAY_TIMEOUT = 1500;

const BookMenuModal: React.FC<BookMenuModalProps> = ({ onClose, openBookChapterModal, openApiKeyModal, resetFurthestPageLocation }) => {
  const { t } = useTranslation();
  const allVariants = getAllVariants();
  const { openModal: openCharacterDetailsModal } = useCharacterModal();

  const [currentFontSize, setCurrentFontSize] = useLocalStorageState("fontSize", { defaultValue: 1 });
  const [currentComplexity, setCurrentComplexity] = useLocalStorageState("readingComplexity", { defaultValue: 100 });

  const [hideOverlay, setHideOverlay] = useState(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isVisible = useRef(allVariants.length > 0);

  const handleSliderChangeWithOverlay = (callback: () => void) => {
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }

    if (!hideOverlay) {
      setHideOverlay(true);
    }

    setTimeout(() => {
      callback();
    }, SLIDER_DELAY);

    overlayTimeoutRef.current = setTimeout(() => {
      setHideOverlay(false);
    }, OVERLAY_TIMEOUT);
  };

  const handleFontSizeChange = (value: number[]) => {
    const fontSize = value[0];
    handleSliderChangeWithOverlay(() => {
      setCurrentFontSize(fontSize);
    });
  };

  const handleComplexityChange = (value: number[]) => {
    const complexity = value[0];
    handleSliderChangeWithOverlay(() => {
      setCurrentComplexity(complexity);
      updateText(complexity);
    });
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

  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  return (
    <ModalUI title={t("book_settings")} onClose={onClose} hideOverlay={hideOverlay}>
      <div className="space-y-2 mb-6">
        <Button
          variant="ghost"
          className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
          onClick={() => {
            openBookChapterModal();
          }}
        >
          <List className="mr-2 h-4 w-4" />
          {t("open_chapter")}
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
          onClick={() => {
            resetFurthestPageLocation();
            onClose();
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          {t("reset_reading_position")}
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
          onClick={() => {
            openApiKeyModal();
          }}
        >
          <BrainCircuit className="mr-2 h-4 w-4" />
          {t("set_openai_api_key")}
        </Button>
      </div>
      <div className={cn("p-4 rounded-lg bg-black/50 border border-white/20 transition-all duration-300")}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-white" />
            <Label htmlFor="font-size" className="text-sm font-medium text-white">
              {t("text_size")}: <span id="font-size-value" className="text-blue-300">{`${currentFontSize.toFixed(1)}x`}</span>
            </Label>
          </div>
          <Slider
            id="font-size"
            variant="secondary"
            min={0.5}
            max={1.5}
            step={0.1}
            value={[currentFontSize]}
            onValueChange={handleFontSizeChange}
            aria-label="Rozmiar tekstu"
            className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-white/50"
          />
          <div className="flex justify-between text-xs text-gray-300">
            <span>{t("small")}</span>
            <span>{t("default")}</span>
            <span>{t("large")}</span>
          </div>
        </div>
      </div>
      {isVisible && (
        <div className={cn("p-4 rounded-lg bg-black/50 border border-white/20 transition-all duration-300 mt-2")}>
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
      )}
      <div className="text-xs text-gray-500 mt-4 text-right">
        <span>
          {t("version")}: {import.meta.env.VITE_BUILD_TIME || "0.0.1"}
        </span>
      </div>
    </ModalUI>
  );
};

export default BookMenuModal;
