import React, { useEffect, useState, useRef, memo } from "react";
import { List, Type, RotateCcw, BrainCircuit, BarChart3, ArrowLeft, History, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import useLocalStorageState from "use-local-storage-state";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

import { Button } from "@player/components/ui/button";
import { Label } from "@player/components/ui/label";
import { Slider } from "@player/components/ui/slider";
import { cn } from "@player/lib/utils";
import ModalUI from "./ModalUI";
import { activateCharacterInteractions } from "@player/helpers/activateCharacterInteractions";
import { replaceXmlTagsIntoHtmlTags } from "@player/helpers/replaceXmlTagsIntoHtmlTags";
import { getAllVariants } from "@player/genericBookDataGetters/getAllVariants";
import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import { getCurrentLocation, systemNavigateTo, getSavedLocation } from "@player/helpers/paragraphsNavigation";
import { getPositionHistory, getCurrentPlatformAndBook } from "@player/services/readingPositionApi";
import { calculateReadingStats, formatReadingTime } from "@player/helpers/calculateReadingStats";

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
  openPositionHistoryModal: () => void;
  resetFurthestPageLocation: () => void;
}

const SLIDER_DELAY = 200;
const OVERLAY_TIMEOUT = 1500;

const BookMenuModal: React.FC<BookMenuModalProps> = ({ onClose, openBookChapterModal, openApiKeyModal, openPositionHistoryModal, resetFurthestPageLocation }) => {
  const { t } = useTranslation();
  const allVariants = getAllVariants();
  const { openModal } = useCharacterModal();

  const [currentFontSize, setCurrentFontSize] = useLocalStorageState("fontSize", { defaultValue: 1 });
  const [currentComplexity, setCurrentComplexity] = useLocalStorageState("readingComplexity", { defaultValue: 100 });

  const [hideOverlay, setHideOverlay] = useState(false);
  const [isFontSizeChanging, setIsFontSizeChanging] = useState(false);
  const [isComplexityChanging, setIsComplexityChanging] = useState(false);

  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVisible = useRef(allVariants.length > 0);

  const bookLocation = useRef(getCurrentLocation());

  // Reading stats state
  const [readingStats, setReadingStats] = useState<{ estimatedTimeRemaining: string; totalReadingTime: string } | null>(null);

  // Load reading stats on mount
  useEffect(() => {
    const loadStats = async () => {
      try {
        const { platformId, bookSlug } = getCurrentPlatformAndBook();
        const history = await getPositionHistory(platformId, bookSlug, 100);
        const saved = getSavedLocation();
        const currentProgress = saved?.progress ?? null;

        const stats = calculateReadingStats(history, currentProgress);

        setReadingStats({ estimatedTimeRemaining: formatReadingTime(stats.estimatedMinutesRemaining), totalReadingTime: formatReadingTime(stats.totalReadingTimeMinutes) });
      } catch (error) {
        console.warn("Failed to load reading stats:", error);
      }
    };

    loadStats();
  }, []);

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

  const handleFontSizePreviewChange = (value: number[]) => {
    const fontSize = value[0];
    setCurrentFontSize(fontSize);
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

    setTimeout(() => {
      setCurrentFontSize(fontSize);
      systemNavigateTo({ currentChapter: bookLocation.current.currentChapter, currentParagraph: bookLocation.current.currentParagraph }, { wait: true });
    }, 200);

    if (!hideOverlay) {
      setHideOverlay(true);
    }

    overlayTimeoutRef.current = setTimeout(() => {
      setHideOverlay(false);
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
        activateCharacterInteractions(element);
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
      <div className="container max-h-[60vh] overflow-y-auto px-1">
        <div className="space-y-2 mb-6 book-settings-actions">
          <Button
            variant="ghost"
            className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
            onPointerUp={() => {
              window.location.href = "/";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                window.location.href = "/";
              }
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back_to_platform")}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
            onPointerUp={(e) => {
              e.preventDefault();
              e.stopPropagation();

              openBookChapterModal();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();

                openBookChapterModal();
              }
            }}
          >
            <List className="mr-2 h-4 w-4" />
            {t("open_chapter")}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
            onPointerUp={() => {
              resetFurthestPageLocation();
              onClose();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                resetFurthestPageLocation();
                onClose();
              }
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t("reset_reading_position")}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
            onPointerUp={() => {
              openApiKeyModal();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openApiKeyModal();
              }
            }}
          >
            <BrainCircuit className="mr-2 h-4 w-4" />
            {t("set_openai_api_key")}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
            onPointerUp={() => {
              openPositionHistoryModal();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPositionHistoryModal();
              }
            }}
          >
            <History className="mr-2 h-4 w-4" />
            {t("position_history") || "Reading History"}
          </Button>
        </div>

        {/* Reading Stats */}
        {readingStats && (
          <div className="mb-4 p-3 rounded-lg bg-black/30 border border-white/10">
            <div className="text-xs text-gray-400 mb-2 flex items-center gap-2">
              <Clock className="w-3 h-3" />
              <span>{t("reading_stats") || "Reading Stats"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm text-white">
              <div>
                <div className="text-xs text-gray-400">{t("time_remaining") || "Time Remaining"}</div>
                <div className="font-medium">{readingStats.estimatedTimeRemaining}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">{t("total_reading_time") || "Total Reading Time"}</div>
                <div className="font-medium">{readingStats.totalReadingTime}</div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 book-settings-container">
          <div className={cn("p-4 rounded-lg bg-black/50 border border-white/20 transition-all duration-300 w-full book-settings-control-box")}>
            <div className="space-y-4 book-settings-control-box-inner">
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
                onValueChange={handleFontSizePreviewChange}
                onValueCommit={handleFontSizeChange}
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
          {/* 
        Hide for now for all books
        {isVisible.current && false && ( 
          <div className={cn("p-4 rounded-lg bg-black/50 border border-white/20 transition-all duration-300 w-full book-settings-control-box")}>
            <div className="space-y-4 book-settings-control-box-inner">
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
        )} */}
        </div>
        <div className="text-xs text-gray-500 mt-4 text-right book-settings-version">
          <span>
            {t("version")}: {import.meta.env.VITE_BUILD_TIME || "0.0.1"}
          </span>
        </div>
      </div>
    </ModalUI>
  );
};

export default BookMenuModal;
