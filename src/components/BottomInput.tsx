import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Send, Telescope, Loader2 } from "lucide-react";
import { motion, Variants, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useRealtime } from "@/context/RealtimeContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CURRENT_BOOK } from "@/consts";
import { useLocation } from "@/state/LocationContext";
import { deepResearchCall } from "@/deepResearchCall";
import { useSearchModal } from "@/stores/modals/searchModal.store";
import { useDeepResearchModal } from "@/stores/modals/deepResearchModal.store";
import { OptionalElement } from "./OptionalElement";
import { useElementVisibilityStore } from "@/stores/elementVisibility.store";
import { hasApiKey } from "@/utils/apiKeyManager";
import { useApiKeyModal } from "@/stores/modals/apiKeyModal.store";

interface SubmitMessageData {
  query: string;
  filter: { chapterFrom: number; chapterTo: number | undefined; paragraphFrom: number; paragraphTo: number | undefined; bookSlug: string };
}

interface BottomInputProps {
  onSubmit?: (message: SubmitMessageData) => void;
  className?: string;
}

const BottomInput: React.FC<BottomInputProps> = ({ onSubmit, className }) => {
  const { t } = useTranslation();

  const [value, setValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isDeepResearchActive, setIsDeepResearchActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const pauseAllTimers = useElementVisibilityStore((state) => state.pauseAllTimers);
  const startAllTimers = useElementVisibilityStore((state) => state.startAllTimers);
  const showAllElements = useElementVisibilityStore((state) => state.showAllElements);

  const { openModal: openSearchModal, closeModal: closeSearchModal, isOpen: isSearchModalOpen, setQuery: setSearchQuery } = useSearchModal();
  const { openModal: openDeepResearchModal, setContent: setDeepResearchContent } = useDeepResearchModal();
  const { openModal: openApiKeyModal } = useApiKeyModal();

  const { startRecording, stopRecording, response } = useRealtime();
  const { location } = useLocation();
  const { chapter: currentChapter, paragraph: currentParagraph } = location;

  const inputRef = useRef<HTMLInputElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateLastActivity = useCallback(() => {
    pauseAllTimers();
    showAllElements();

    lastActivityRef.current = Date.now();
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Add keyboard listener for Cmd+F / Ctrl+F
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "f" || event.key === "F") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        updateLastActivity();
        // Focus the input after a small delay to ensure it's visible
        setTimeout(() => {
          if (inputRef.current) inputRef.current.focus();
        }, 50);
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [updateLastActivity]);

  useEffect(() => {
    if (response && !isRecording) {
      setValue(response);
      updateLastActivity();
      if (isSearchModalOpen) {
        setSearchQuery(response);
      }
    }
  }, [response, isRecording, isSearchModalOpen, setSearchQuery, updateLastActivity]);

  const toggleDeepResearch = () => {
    updateLastActivity();
    const newDeepResearchState = !isDeepResearchActive;
    setIsDeepResearchActive(newDeepResearchState);
    if (newDeepResearchState && isSearchModalOpen) {
      closeSearchModal(); // Close search modal if deep research is activated
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateLastActivity();
    const newVal = e.target.value;
    setValue(newVal);

    if (isDeepResearchActive) return;

    const trimmedValue = newVal.trim();
    if (!trimmedValue.length && isSearchModalOpen) {
      setSearchQuery("");
      return;
    }

    if (!isSearchModalOpen) {
      openSearchModal(true, true, trimmedValue);
    } else {
      setSearchQuery(trimmedValue);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    updateLastActivity();

    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    if (isSearchModalOpen) {
      setSearchQuery(trimmedValue);
      return;
    }

    if (isDeepResearchActive) {
      setIsThinking(true);
      openDeepResearchModal(undefined, true, true);

      deepResearchCall(trimmedValue, location)
        .then((deepResearchResponse) => {
          setDeepResearchContent(deepResearchResponse);
        })
        .catch((error) => {
          console.error("Deep research failed:", error);
          setDeepResearchContent(t("deep_research_error"));
        })
        .finally(() => {
          setIsThinking(false);
        });
    } else if (onSubmit) {
      onSubmit({ query: trimmedValue, filter: { chapterFrom: 1, chapterTo: currentChapter, paragraphFrom: 1, paragraphTo: currentParagraph, bookSlug: CURRENT_BOOK } });
    }
  };

  const handleRecordingStart = useCallback(() => {
    if (isRecording) return;

    // Check if API key is set before starting recording
    if (!hasApiKey()) {
      openApiKeyModal();
      return;
    }

    updateLastActivity();
    setIsRecording(true);

    setValue("");

    // Clear search if starting voice input while search modal is open
    if (isSearchModalOpen) setSearchQuery("");

    startRecording().catch((error) => {
      console.error("Error starting recording:", error);
      setIsRecording(false);
    });
  }, [isRecording, startRecording, isSearchModalOpen, setSearchQuery, updateLastActivity, openApiKeyModal]);

  const handleRecordingEnd = useCallback(() => {
    if (!isRecording) return;
    updateLastActivity();
    setTimeout(() => {
      stopRecording()
        .catch((error) => console.error("Error stopping recording:", error))
        .finally(() => setIsRecording(false));
    }, 150);
  }, [isRecording, stopRecording, updateLastActivity]);

  return (
    <OptionalElement className={cn("transition-all duration-300 ease-out w-full flex justify-center", className)}>
      <motion.div
        className={cn("bg-black/70 textured-bg border shadow-xl text-white border-white/30 w-full rounded-3xl px-3 py-2", isRecording && "recording-active")}
        animate={isRecording ? "recordingContainer" : "idle"}
        initial="idle"
        variants={variants.container}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key="expanded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <form onSubmit={handleSubmit} className="flex items-center space-x-2 min-w-[280px] sm:min-w-[350px]">
              <div className="relative flex-grow flex items-center">
                <AnimatePresence>
                  {isRecording && (
                    <motion.div
                      key="recording-indicator"
                      className="absolute left-2 w-3 h-3 rounded-full bg-red-500"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.05, 1] }}
                      exit={{ opacity: 0, scale: 0, transition: { duration: 0.2 } }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                  )}
                </AnimatePresence>
                <input
                  id="bottom-input"
                  ref={inputRef}
                  type="text"
                  value={value}
                  onChange={handleInputChange}
                  placeholder={isRecording ? t("listening") : isThinking ? t("thinking") : isDeepResearchActive ? t("enter_deep_research") : t("search_or_ask")}
                  className={cn("flex-grow bg-transparent text-white outline-none px-2 py-1", isRecording ? "opacity-80 pl-7 font-medium" : "")}
                  disabled={isRecording || isThinking}
                  autoComplete="off"
                  onFocus={updateLastActivity}
                  onBlur={() => startAllTimers()}
                />
              </div>

              <div className="flex items-center space-x-2">
                {/* Deep Research Button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        type="button"
                        aria-pressed={isDeepResearchActive}
                        className={cn(
                          "rounded-full p-2 flex items-center justify-center",
                          isDeepResearchActive ? "text-orange-400" : "text-white/70",
                          isThinking ? "opacity-50 cursor-default" : "cursor-pointer",
                        )}
                        whileHover={!isThinking ? "hover" : undefined}
                        whileTap={!isThinking ? "tap" : undefined}
                        variants={variants.deepResearchButton}
                        onClick={toggleDeepResearch}
                        disabled={isThinking || isRecording}
                      >
                        {isThinking ? <Loader2 size={18} className="animate-spin" /> : <Telescope size={18} />}
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent>{isThinking ? t("thinking") : t("deep_research")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Send/Mic Button */}
                {value.trim() && !isRecording ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          type="submit"
                          aria-label="Send message"
                          className="p-2 rounded-full flex items-center justify-center cursor-pointer text-blue-400"
                          whileHover="hover"
                          whileTap="tap"
                          variants={variants.button}
                          disabled={isThinking}
                        >
                          <Send size={18} />
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent>{t("send_message")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          type="button"
                          className={cn("p-2 rounded-full flex items-center justify-center cursor-pointer", isRecording ? "text-red-400" : "text-white/70")}
                          style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
                          whileHover={!isRecording ? "hover" : undefined}
                          whileTap={{ scale: 1.2 }}
                          variants={variants.button}
                          initial="idle"
                          animate={isRecording ? "recording" : "idle"}
                          // onClick={() => {
                          //   if (isRecording) {
                          //     setIsRecording(false);
                          //     handleRecordingEnd();
                          //   }
                          //   setIsRecording(true);
                          //   handleRecordingStart();
                          // }}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            handleRecordingStart();
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            handleRecordingEnd();
                          }}
                          onTouchCancel={(e) => {
                            e.preventDefault();
                            handleRecordingEnd();
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleRecordingStart();
                          }}
                          onMouseUp={(e) => {
                            e.preventDefault();
                            handleRecordingEnd();
                          }}
                          onMouseLeave={() => isRecording && handleRecordingEnd()}
                          onContextMenu={(e) => e.preventDefault()}
                          disabled={isThinking}
                        >
                          <Mic size={18} />
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent>{isRecording ? t("stop_recording") : t("start_recording")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </form>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </OptionalElement>
  );
};

export default BottomInput;

const variants: Record<string, Variants> = {
  button: {
    hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)", transition: { duration: 0.2 } },
    tap: { scale: 0.9, backgroundColor: "rgba(255,255,255,0.3)", transition: { type: "spring", stiffness: 400, damping: 10 } },
    idle: { scale: 1, backgroundColor: "transparent", boxShadow: "0px 0px 0px rgba(239, 68, 68, 0)", color: "rgba(255, 255, 255, 0.7)", transition: { duration: 0.3 } },
    recording: {
      scale: [1, 1.1, 1],
      backgroundColor: ["rgba(239, 68, 68, 0.2)", "rgba(239, 68, 68, 0.4)", "rgba(239, 68, 68, 0.2)"],
      boxShadow: ["0px 0px 0px rgba(239, 68, 68, 0.4)", "0px 0px 15px rgba(239, 68, 68, 0.6)", "0px 0px 0px rgba(239, 68, 68, 0.4)"],
      transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
    },
  },
  deepResearchButton: {
    hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)", transition: { duration: 0.2 } },
    tap: { scale: 0.9, backgroundColor: "rgba(255,255,255,0.3)", transition: { type: "spring", stiffness: 400, damping: 10 } },
    idle: { scale: 1, backgroundColor: "transparent", boxShadow: "0px 0px 0px rgba(239, 68, 68, 0)", transition: { duration: 0.3 } },
  },
  container: {
    idle: { boxShadow: "0px 0px 0px rgba(239, 68, 68, 0)", borderColor: "rgba(255, 255, 255, 0.3)", transition: { duration: 0.3 } },
    recordingContainer: {
      boxShadow: ["0px 0px 0px rgba(239, 68, 68, 0.2)", "0px 0px 12px rgba(239, 68, 68, 0.6)", "0px 0px 0px rgba(239, 68, 68, 0.2)"],
      borderColor: ["rgba(255, 255, 255, 0.3)", "rgba(239, 68, 68, 0.6)", "rgba(255, 255, 255, 0.3)"],
      transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
    },
  },
};
