import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Send, Telescope, Loader2 } from "lucide-react";
import { motion, Variants, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";

import { cn } from "@player/lib/utils";
import { useRealtime } from "@player/context/RealtimeContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@player/components/ui/tooltip";
import { bookDataLoader } from "@player/services/bookDataLoader";
import { useLocation } from "@player/state/LocationContext";
import { deepResearchCall } from "@player/deepResearchCall";
import { useSearchModal } from "@player/stores/modals/searchModal.store";
import { useDeepResearchModal } from "@player/stores/modals/deepResearchModal.store";
import { OptionalElement } from "./OptionalElement";
import { useElementVisibilityStore } from "@player/stores/elementVisibility.store";
import { hasApiKey } from "@player/utils/apiKeyManager";
import { useApiKeyModal } from "@player/stores/modals/apiKeyModal.store";
import { Filter } from "@player/types/book";

interface SubmitMessageData {
  query: string;
  filter: Filter;
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

  const updateLastActivity = useCallback(() => {
    pauseAllTimers();
    showAllElements();
  }, [pauseAllTimers, showAllElements]);

  useEffect(() => {
    // Add keyboard listener for Cmd+F / Ctrl+F
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "f" || event.key === "F") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        updateLastActivity();

        // Open search modal first if not already open
        if (!isSearchModalOpen && !isDeepResearchActive) {
          openSearchModal(true, true, value.trim());
        }

        // Defer focus until after the modal is opened and DOM is updated
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (inputRef.current && document.activeElement !== inputRef.current) {
              inputRef.current.focus();
            }
          });
        });
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [updateLastActivity, isSearchModalOpen, isDeepResearchActive, openSearchModal, value]);

  useEffect(() => {
    if (response && !isRecording) {
      setValue(response);
      updateLastActivity();
      if (isSearchModalOpen) {
        setSearchQuery(response);
      }
    }
  }, [response, isRecording, isSearchModalOpen, setSearchQuery, updateLastActivity]);

  const toggleDeepResearch = useCallback(() => {
    updateLastActivity();
    const newDeepResearchState = !isDeepResearchActive;
    setIsDeepResearchActive(newDeepResearchState);
    if (newDeepResearchState && isSearchModalOpen) {
      closeSearchModal(); // Close search modal if deep research is activated
    }
  }, [closeSearchModal, isDeepResearchActive, isSearchModalOpen, updateLastActivity]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [isDeepResearchActive, isSearchModalOpen, openSearchModal, setSearchQuery, updateLastActivity],
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
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
        onSubmit({
          query: trimmedValue,
          filter: { chapterFrom: 1, chapterTo: currentChapter, paragraphFrom: 1, paragraphTo: currentParagraph, bookSlug: bookDataLoader.getCurrentBook() },
        });
      }
    },
    [
      updateLastActivity,
      value,
      isSearchModalOpen,
      setSearchQuery,
      isDeepResearchActive,
      openDeepResearchModal,
      location,
      setDeepResearchContent,
      t,
      onSubmit,
      currentChapter,
      currentParagraph,
    ],
  );

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

  const handleInputFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      updateLastActivity();
      e.target.select();
      if (!isSearchModalOpen && !isDeepResearchActive) {
        openSearchModal(true, true, value.trim());
        // Ensure focus is maintained after modal opens
        requestAnimationFrame(() => {
          if (inputRef.current && document.activeElement !== inputRef.current) {
            inputRef.current.focus();
          }
        });
      }
    },
    [updateLastActivity, isSearchModalOpen, isDeepResearchActive, openSearchModal, value],
  );

  const handleInputClick = useCallback(
    (_e: React.MouseEvent<HTMLInputElement>) => {
      // Ensure the element is visible before focusing
      updateLastActivity();

      // Defer focus until after the next repaint to ensure visibility is updated
      requestAnimationFrame(() => {
        if (inputRef.current && document.activeElement !== inputRef.current) {
          inputRef.current.focus();
        }
      });
    },
    [updateLastActivity],
  );

  return (
    <OptionalElement className={cn("transition-all duration-300 ease-out w-full flex justify-center", className)}>
      <motion.div
        className={cn(
          "bg-black/70 textured-bg border shadow-xl text-white border-white/30 w-full rounded-3xl px-2 py-[2px] md:py-[3px] md:px-3",
          isRecording && "recording-active",
        )}
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
                  onClick={handleInputClick}
                  onFocus={handleInputFocus}
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
