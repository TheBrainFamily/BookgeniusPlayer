import React, { useEffect, useState, useRef, memo, useMemo } from "react";
import { List, Type, RotateCcw, BrainCircuit, BarChart3, ArrowLeft, History, Clock, Share2, Check, Mic, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import useLocalStorageState from "use-local-storage-state";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";

import { Button } from "@player/components/ui/button";
import { Label } from "@player/components/ui/label";
import { Slider } from "@player/components/ui/slider";
import { cn } from "@player/lib/utils";
import ModalUI from "./ModalUI";
import { useRealtime } from "@player/context/RealtimeContext";
import { activateCharacterInteractions } from "@player/helpers/activateCharacterInteractions";
import { replaceXmlTagsIntoHtmlTags } from "@player/helpers/replaceXmlTagsIntoHtmlTags";
import { getAllVariants } from "@player/genericBookDataGetters/getAllVariants";
import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import { getCurrentLocation, systemNavigateTo, getSavedLocation } from "@player/helpers/paragraphsNavigation";
import { getPositionHistory, getCurrentPlatformAndBook } from "@player/services/readingPositionApi";
import { calculateReadingStats, formatReadingTime } from "@player/helpers/calculateReadingStats";
import { getReadableBuildInfo } from "@player/helpers/buildInfo";
import { getBookData } from "@player/genericBookDataGetters/getBookData";

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

// Build version formatting moved to helper

const BookMenuModal: React.FC<BookMenuModalProps> = ({ onClose, openBookChapterModal, openApiKeyModal, openPositionHistoryModal, resetFurthestPageLocation }) => {
  const { t } = useTranslation();
  const allVariants = getAllVariants();
  const { openModal } = useCharacterModal();
  const {
    metadata: { bookForm },
  } = getBookData();

  const [currentFontSize, setCurrentFontSize] = useLocalStorageState("fontSize", { defaultValue: 1 });
  const [currentComplexity, setCurrentComplexity] = useLocalStorageState("readingComplexity", { defaultValue: 100 });

  const { primeMicrophone, connectConversation, isConnected } = useRealtime();
  const [hideOverlay, setHideOverlay] = useState(false);
  const [isFontSizeChanging, setIsFontSizeChanging] = useState(false);
  const [isComplexityChanging, setIsComplexityChanging] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shareJustCopied, setShareJustCopied] = useState(false);
  const shareIconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPreparingRealtime, setIsPreparingRealtime] = useState(false);
  const initialAudioResponses = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("audioResponses") === "true";
    } catch {
      return false;
    }
  }, []);
  const [audioResponsesEnabled, setAudioResponsesEnabled] = useState(initialAudioResponses);

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
        const isPlayFormat = bookForm === "play" || bookForm === "mixed";
        const sentenceNumber = parseInt(sentenceData.id.split("-s")?.[1] ?? "1", 10);
        const isFirstSentence = sentenceNumber === 1;
        element.innerHTML = replaceXmlTagsIntoHtmlTags(textToDisplay, isPlayFormat, isFirstSentence);

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

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (shareIconTimerRef.current) clearTimeout(shareIconTimerRef.current);
    };
  }, []);

  const generateShareLink = (chapter: number, paragraph: number) => {
    try {
      const url = new URL(window.location.href);
      url.hash = `${chapter}-${paragraph}`;
      return url.toString();
    } catch (error) {
      console.warn("Failed to generate share link", error);
      return `${window.location.origin}${window.location.pathname}#${chapter}-${paragraph}`;
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setIsToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setIsToastVisible(false), 2000);
  };

  const copyCurrentLocationLink = async () => {
    const location = getCurrentLocation();
    const chapter = location.currentChapter ?? location.chapter ?? 0;
    const paragraph = location.currentParagraph ?? location.paragraph ?? 0;
    const link = generateShareLink(chapter, paragraph);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        showToast("Link copied");
        setShareJustCopied(true);
        if (shareIconTimerRef.current) clearTimeout(shareIconTimerRef.current);
        shareIconTimerRef.current = setTimeout(() => setShareJustCopied(false), 1500);
        return;
      }
    } catch (e) {
      // fall through to fallback
    }

    try {
      const temp = document.createElement("input");
      temp.value = link;
      document.body.appendChild(temp);
      temp.select();
      const success = document.execCommand("copy");
      document.body.removeChild(temp);
      if (success) {
        showToast("Link copied");
        setShareJustCopied(true);
        if (shareIconTimerRef.current) clearTimeout(shareIconTimerRef.current);
        shareIconTimerRef.current = setTimeout(() => setShareJustCopied(false), 1500);
      } else {
        showToast("Unable to copy. Please copy manually.");
      }
    } catch {
      showToast("Unable to copy. Please copy manually.");
    }
  };

  const handlePrepareRealtime = async () => {
    if (isPreparingRealtime) return;
    setIsPreparingRealtime(true);
    try {
      const result = await primeMicrophone();
      if (result === "failed") {
        showToast(t("mic_permission_blocked", "Microphone access blocked. Allow mic and try again."));
        return;
      }
      if (!isConnected) {
        await connectConversation();
      }
      showToast(t("voice_session_ready", "Microphone primed and realtime session connected"));
    } catch (error) {
      console.warn("Failed to prepare realtime session", error);
      showToast(t("voice_session_failed", "Unable to prepare voice session. Try again."));
    } finally {
      setIsPreparingRealtime(false);
    }
  };

  const handleToggleAudioResponses = () => {
    const next = !audioResponsesEnabled;
    setAudioResponsesEnabled(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("audioResponses", next ? "true" : "false");
      window.location.replace(url.toString());
    } catch (error) {
      console.warn("Failed to update audioResponses query param via URL API", error);
      try {
        const params = new URLSearchParams(window.location.search);
        params.set("audioResponses", next ? "true" : "false");
        const search = params.toString();
        const href = `${window.location.origin}${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
        window.location.href = href;
      } catch (fallbackError) {
        console.warn("Fallback audioResponses toggle failed", fallbackError);
      }
    }
  };

  // removed dialog-based share flow

  const currentShareableLocation = getCurrentLocation();
  const currentChapterLabel = currentShareableLocation.currentChapter ?? currentShareableLocation.chapter ?? 0;
  const currentParagraphLabel = currentShareableLocation.currentParagraph ?? currentShareableLocation.paragraph ?? 0;

  return (
    <>
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
              data-keep-modal-open="true"
              disabled={isPreparingRealtime}
              onPointerUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handlePrepareRealtime();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  void handlePrepareRealtime();
                }
              }}
            >
              {isPreparingRealtime ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
              {isPreparingRealtime ? t("preparing_voice_session", "Preparing voice session…") : t("prepare_voice_session", "Warm up voice session")}
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
            <Button
              variant="ghost"
              className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
              data-keep-modal-open="true"
              onPointerUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                copyCurrentLocationLink();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  copyCurrentLocationLink();
                }
              }}
            >
              <span className="mr-2 h-4 w-4 inline-flex items-center justify-center">
                <AnimatePresence mode="wait" initial={false}>
                  {shareJustCopied ? (
                    <motion.span
                      key="check"
                      initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Check className="h-4 w-4 text-green-400" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="share"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Share2 className="h-4 w-4" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              {shareJustCopied
                ? t("copied") || "Copied!"
                : t("share_link_label", { chapter: currentChapterLabel, paragraph: currentParagraphLabel }) ||
                  `Share link to Chapter: ${currentChapterLabel}, paragraph: ${currentParagraphLabel}`}
            </Button>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/20 bg-black/40 px-3 py-2" data-keep-modal-open="true">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">{t("menu_audio_responses", "Audio responses")}</span>
                <span className="text-xs text-white/60">{t("menu_audio_responses_hint", "Toggle spoken answers and reload to apply.")}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={audioResponsesEnabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleAudioResponses();
                }}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                  audioResponsesEnabled ? "bg-blue-500" : "bg-white/20",
                )}
              >
                <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white transition-transform", audioResponsesEnabled ? "translate-x-5" : "translate-x-1")} />
              </button>
            </div>
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
          <div className="text-xs text-gray-500 mt-4 text-right book-settings-version flex items-center justify-between gap-2">
            <span>Beta</span>
            <span>
              {t("version")}: {getReadableBuildInfo(import.meta.env.VITE_BUILD_TIME as string | undefined)}
            </span>
          </div>
        </div>
      </ModalUI>

      {/* Toast */}
      <AnimatePresence>
        {isToastVisible && (
          <motion.div
            key="share-toast"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed top-4 right-4 z-[70]"
            data-keep-modal-open="true"
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-black/80 border border-white/20 shadow-md text-white text-sm">
              <Check className="w-4 h-4 text-green-400" />
              <span>{toastMessage || t("link_copied") || "Link copied"}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default BookMenuModal;
