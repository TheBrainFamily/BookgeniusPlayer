import React, { useEffect, useState, useRef, memo } from "react";
import { List, Type, RotateCcw, BrainCircuit, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import useLocalStorageState from "use-local-storage-state";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import ModalUI from "./ModalUI";
import { activateCharacterInteractions } from "@/helpers/activateCharacterInteractions";
import { replaceXmlTagsIntoHtmlTags } from "@/helpers/replaceXmlTagsIntoHtmlTags";
import { getAllVariants } from "@/genericBookDataGetters/getAllVariants";
import { useCharacterModal } from "@/stores/modals/characterModal.store";
import { getCurrentLocation } from "@/helpers/paragraphsNavigation";

const AnimatedFontSize: React.FC<{ value: number; isChanging: boolean }> = memo(({ value, isChanging }) => {
  const [currentDisplayValue, setCurrentDisplayValue] = useState(value);
  const motionValue = useMotionValue(currentDisplayValue);
  const spring = useSpring(motionValue, { stiffness: 50, damping: 15, mass: 1, restDelta: 0.001 });
  const rounded = useTransform(spring, (latest) => Math.round(latest * 10) / 10);

  useEffect(() => {
    setCurrentDisplayValue(value);
    motionValue.set(value);
  }, [value, motionValue]);

  return (
    <span className={`transition-colors duration-300 ${isChanging ? "text-blue-300" : "text-blue-300"}`}>
      <motion.span>{rounded}</motion.span>x
    </span>
  );
});

const AnimatedComplexity: React.FC<{ value: number; isChanging: boolean }> = memo(({ value, isChanging }) => {
  const [currentDisplayValue, setCurrentDisplayValue] = useState(value);
  const motionValue = useMotionValue(currentDisplayValue);
  const spring = useSpring(motionValue, { stiffness: 50, damping: 15, mass: 1, restDelta: 0.001 });
  const rounded = useTransform(spring, (latest) => Math.round(latest));

  useEffect(() => {
    setCurrentDisplayValue(value);
    motionValue.set(value);
  }, [value, motionValue]);

  return <motion.span className={`transition-colors duration-300 ${isChanging ? "text-blue-300" : "text-blue-300"}`}>{rounded}</motion.span>;
});

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

const hideNonVisibleParagraphs = (currentChapter: number, currentParagraph: number) => {
  document.querySelectorAll("[data-chapter]").forEach((chapter: HTMLElement) => {
    const id = parseInt(chapter.dataset.chapter || "0");
    if (Math.abs(id - currentChapter) > 0) {
      chapter.style.display = "none";
    } else {
      chapter.style.display = "block";
    }
  });
  console.log(`currentChapter: ${currentChapter}, currentParagraph: ${currentParagraph}`);
  document.querySelectorAll(`[data-chapter="${currentChapter}"] [data-index]`).forEach((paragraph: HTMLElement) => {
    const id = parseInt(paragraph.dataset.index || "0");
    if (id < currentParagraph) {
      paragraph.style.display = "none";
    } else {
      paragraph.style.display = "block";
    }
  });
};
const displayAllChapters = () => {
  document.querySelectorAll("[data-chapter]").forEach((chapter: HTMLElement) => {
    chapter.style.display = "block";
  });
  document.querySelectorAll("[data-index]").forEach((paragraph: HTMLElement) => {
    paragraph.style.display = "block";
  });
};

const BookMenuModal: React.FC<BookMenuModalProps> = ({ onClose, openBookChapterModal, openApiKeyModal, resetFurthestPageLocation }) => {
  const { t } = useTranslation();
  const allVariants = getAllVariants();
  const { openModal: openCharacterDetailsModal } = useCharacterModal();

  const [currentFontSize, setCurrentFontSize] = useLocalStorageState("fontSize", { defaultValue: 1 });
  const [currentComplexity, setCurrentComplexity] = useLocalStorageState("readingComplexity", { defaultValue: 100 });

  const [hideOverlay, setHideOverlay] = useState(false);
  const [isFontSizeChanging, setIsFontSizeChanging] = useState(false);
  const [isComplexityChanging, setIsComplexityChanging] = useState(false);

  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isVisible = useRef(allVariants.length > 0);
  const hiddenParagraphsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleFontSizePreset = (size: number) => {
    setHideOverlay(true);
    setIsFontSizeChanging(true);

    setTimeout(() => {
      setCurrentFontSize(size);
    }, 100);

    setTimeout(() => {
      setHideOverlay(false);
      setIsFontSizeChanging(false);
    }, 1500);
  };

  const handleComplexityPreset = (level: number) => {
    setHideOverlay(true);
    setIsComplexityChanging(true);

    setTimeout(() => {
      setCurrentComplexity(level);
      updateText(level);
    }, 100);

    setTimeout(() => {
      setHideOverlay(false);
      setIsComplexityChanging(false);
    }, 1500);
  };

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

    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }

    const currentLocation = getCurrentLocation();
    console.log("location currentChapter", currentLocation.currentChapter);
    hideNonVisibleParagraphs(currentLocation.currentChapter, currentLocation.currentParagraph);
    setTimeout(() => {
      setCurrentFontSize(fontSize);
    }, 200);

    if (!hideOverlay) {
      setHideOverlay(true);
    }

    if (hiddenParagraphsTimeoutRef.current) {
      clearTimeout(hiddenParagraphsTimeoutRef.current);
    }

    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }

    overlayTimeoutRef.current = setTimeout(() => {
      setHideOverlay(false);
    }, 1500);
    hiddenParagraphsTimeoutRef.current = setTimeout(() => {
      displayAllChapters();
    }, 1500);
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
      <div className="flex lg:flex-col space-x-2 lg:space-y-2 lg:space-x-0">
        <div className={cn("p-4 rounded-lg bg-black/50 border border-white/20 transition-all duration-300 w-1/2 lg:w-full")}>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-white" />
              <Label htmlFor="font-size" className="text-sm font-medium text-white">
                {t("text_size")}: <AnimatedFontSize value={currentFontSize} isChanging={isFontSizeChanging} />
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
              <span className="cursor-pointer hover:text-white transition-colors" onClick={() => handleFontSizePreset(0.5)}>
                {t("small")}
              </span>
              <span className="cursor-pointer hover:text-white transition-colors" onClick={() => handleFontSizePreset(1.0)}>
                {t("default")}
              </span>
              <span className="cursor-pointer hover:text-white transition-colors" onClick={() => handleFontSizePreset(1.5)}>
                {t("large")}
              </span>
            </div>
          </div>
        </div>
        {isVisible && (
          <div className={cn("p-4 rounded-lg bg-black/50 border border-white/20 transition-all duration-300 w-1/2 lg:w-full")}>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-white" />
                <Label htmlFor="complexity-slider" className="text-sm font-medium text-white">
                  {t("reading_complexity")}: <AnimatedComplexity value={currentComplexity} isChanging={isComplexityChanging} />
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
                <span className="cursor-pointer hover:text-white transition-colors" onClick={() => handleComplexityPreset(20)}>
                  {t("simple")}
                </span>
                <span className="cursor-pointer hover:text-white transition-colors" onClick={() => handleComplexityPreset(60)}>
                  {t("medium")}
                </span>
                <span className="cursor-pointer hover:text-white transition-colors" onClick={() => handleComplexityPreset(100)}>
                  {t("complex")}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-4 text-right">
        <span>
          {t("version")}: {import.meta.env.VITE_BUILD_TIME || "0.0.1"}
        </span>
      </div>
    </ModalUI>
  );
};

export default BookMenuModal;
