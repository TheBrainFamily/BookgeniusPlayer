import React, { useState, useEffect, useRef, useCallback, useMemo, startTransition } from "react";
import { Mic, Send, Telescope, Loader2 } from "lucide-react";
import { motion, Variants, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";

import { cn } from "@player/lib/utils";
import { useRealtime } from "@player/context/RealtimeContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@player/components/ui/tooltip";
import { useLocation } from "@player/state/LocationContext";
import { deepResearchCall } from "@player/deepResearchCall";
import { useSearchModal } from "@player/stores/modals/searchModal.store";
import { useDeepResearchModal } from "@player/stores/modals/deepResearchModal.store";
import { OptionalElement } from "./OptionalElement";
import { useElementVisibilityStore } from "@player/stores/elementVisibility.store";
import { hasApiKey } from "@player/utils/apiKeyManager";
import { useApiKeyModal } from "@player/stores/modals/apiKeyModal.store";
import { askCall } from "@player/askCall";

interface BottomInputProps {
  className?: string;
}

const BottomInput: React.FC<BottomInputProps> = ({ className }) => {
  const { t } = useTranslation();

  const [value, setValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isDeepResearchActive, setIsDeepResearchActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { pauseAllTimers, startAllTimers, showAllElements } = useElementVisibilityStore();
  const { openModal: openSearchModal, closeModal: closeSearchModal, isOpen: isSearchModalOpen, setQuery: setSearchQuery } = useSearchModal();
  const { openModal: openDeepResearchModal, setContent: setDeepResearchContent, closeModal: closeDeepResearchModal, isOpen: isDeepResearchModalOpen } = useDeepResearchModal();
  const { openModal: openApiKeyModal } = useApiKeyModal();

  const { startRecording, stopRecording, response } = useRealtime();
  const { location } = useLocation();

  const handleActivity = useCallback(() => {
    pauseAllTimers(true);
    showAllElements();
  }, [pauseAllTimers, showAllElements]);

  const openModalWithFocus = useCallback(() => {
    if (isDeepResearchActive) return;

    if (isDeepResearchModalOpen) {
      closeDeepResearchModal();
    }

    if (!isSearchModalOpen) {
      openSearchModal(true, true, value.trim());
    }

    if (inputRef.current == null) return;

    const inputEl = inputRef.current;
    inputEl.focus();

    // Use microtask to ensure DOM is updated before setting selection
    queueMicrotask(() => {
      if (!inputEl) return;
      const length = inputEl.value.length;
      inputEl.setSelectionRange(length, length);
    });
  }, [isDeepResearchActive, isSearchModalOpen, openSearchModal, value, isDeepResearchModalOpen, closeDeepResearchModal]);

  const handleAsk = useCallback(
    async (query: string) => {
      setIsThinking(true);
      console.log("setting isThinking to true");
      openDeepResearchModal(undefined, true, true);

      try {
        const response = await askCall(query, location);
        console.log("askCall response", response);
        setDeepResearchContent(response);
      } catch (error) {
        console.error("Ask call failed:", error);
        setDeepResearchContent(t("ask_error"));
      } finally {
        console.log("setting isThinking to false");
        setIsThinking(false);
      }
    },
    [location, openDeepResearchModal, setDeepResearchContent, t],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setValue(newValue);

      if (isDeepResearchActive) return;
      if (isRecording) return;

      const trimmedNewValue = newValue.trim();
      startTransition(() => {
        if (trimmedNewValue.length >= 2) {
          setSearchQuery(trimmedNewValue);
        } else {
          setSearchQuery("");
        }
      });
    },
    [isDeepResearchActive, isRecording, setSearchQuery],
  );

  const handleInputInteraction = useCallback(() => {
    handleActivity();

    if (isDeepResearchActive) return;

    openModalWithFocus();
  }, [handleActivity, isDeepResearchActive, openModalWithFocus]);

  const executeDeepResearch = useCallback(
    (query: string) => {
      setIsThinking(true);
      openDeepResearchModal(undefined, true, true);

      deepResearchCall(query, location)
        .then((text) => {
          if (!text || text.trim().length === 0) {
            setDeepResearchContent(t("deep_research_error"));
          } else {
            setDeepResearchContent(text);
          }
        })
        .catch((error) => {
          console.error("Deep research failed:", error);
          setDeepResearchContent(t("deep_research_error"));
        })
        .finally(() => setIsThinking(false));
    },
    [location, setDeepResearchContent, t, openDeepResearchModal],
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      handleActivity();

      const trimmed = value.trim();
      if (!trimmed) return;

      if (isSearchModalOpen) {
        closeSearchModal();

        handleAsk(trimmed);
        return;
      }

      if (isDeepResearchActive) {
        executeDeepResearch(trimmed);
      }
    },
    [handleActivity, value, isSearchModalOpen, isDeepResearchActive, executeDeepResearch, handleAsk, closeSearchModal],
  );

  const toggleDeepResearch = useCallback(() => {
    handleActivity();

    const newState = !isDeepResearchActive;
    setIsDeepResearchActive(newState);

    if (newState && isSearchModalOpen) {
      closeSearchModal();
    }
  }, [handleActivity, isDeepResearchActive, isSearchModalOpen, closeSearchModal]);

  const handleRecordingStart = useCallback(() => {
    if (isRecording || !hasApiKey()) {
      if (!hasApiKey()) openApiKeyModal();
      return;
    }

    handleActivity();
    setIsRecording(true);
    setValue("");

    if (isSearchModalOpen) setSearchQuery("");

    startRecording().catch((error) => {
      console.error("Error starting recording:", error);
      setIsRecording(false);
    });
  }, [handleActivity, isRecording, isSearchModalOpen, setSearchQuery, startRecording, openApiKeyModal]);

  const handleRecordingEnd = useCallback(() => {
    if (!isRecording) return;

    handleActivity();

    setTimeout(() => {
      stopRecording()
        .catch((error) => console.error("Error stopping recording:", error))
        .finally(() => setIsRecording(false));
    }, 150);
  }, [handleActivity, isRecording, stopRecording]);

  const placeholder = useMemo(() => {
    if (isRecording) return t("listening");
    if (isThinking) return t("thinking");
    if (isDeepResearchActive) return t("enter_deep_research");
    return t("search_or_ask");
  }, [isRecording, isThinking, isDeepResearchActive, t]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "f" || event.key === "F") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleActivity();
        openModalWithFocus();
      }
    };

    const handleDocumentPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;

      if (containerRef.current?.contains(target)) return;
      if (target.closest('[role="dialog"]') || target.closest('[role="tooltip"]')) return;

      startAllTimers();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    };
  }, [handleActivity, openModalWithFocus, startAllTimers]);

  useEffect(() => {
    if (response && !isRecording) {
      setValue(response);
      handleActivity();

      if (isSearchModalOpen) setSearchQuery(response);
      return;
    }
  }, [handleActivity, response, isRecording, isSearchModalOpen, setSearchQuery]);

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
        ref={containerRef}
        data-keep-modal-open="true"
      >
        <motion.div key="expanded" variants={variants.expandedContainer} initial="initial" animate="animate" exit="exit">
          <form onSubmit={handleSubmit} className="flex items-center space-x-2 min-w-[280px] sm:min-w-[350px]">
            <div className="relative flex-grow flex items-center">
              <AnimatePresence>
                {isRecording && (
                  <motion.div
                    key="recording-indicator"
                    className="absolute left-2 w-3 h-3 rounded-full bg-red-500"
                    variants={variants.recordingIndicator}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  />
                )}
              </AnimatePresence>
              <input
                id="bottom-input"
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                onFocus={handleInputInteraction}
                placeholder={placeholder}
                className={cn("flex-grow bg-transparent text-white outline-none px-2 py-1", isRecording ? "opacity-80 pl-7 font-medium" : "")}
                disabled={isRecording || isThinking}
                autoComplete="off"
              />
            </div>
            <div className="flex items-center space-x-2">
              {/* Deep Research Button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.button
                      type="button"
                      onPointerDown={toggleDeepResearch}
                      disabled={isThinking || isRecording}
                      className={cn(
                        "rounded-full p-2 flex items-center justify-center",
                        isDeepResearchActive ? "text-orange-400" : "text-white/70",
                        isThinking ? "opacity-50 cursor-default" : "cursor-pointer",
                      )}
                      whileHover={!isThinking ? "hover" : undefined}
                      whileTap={!isThinking ? "tap" : undefined}
                      variants={variants.deepResearchButton}
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
                        disabled={isThinking}
                        className="p-2 rounded-full flex items-center justify-center cursor-pointer text-blue-400"
                        whileHover="hover"
                        whileTap="tap"
                        variants={variants.button}
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
                        disabled={isThinking}
                        className={cn("p-2 rounded-full flex items-center justify-center cursor-pointer", isRecording ? "text-red-400" : "text-white/70")}
                        style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
                        whileHover={!isRecording ? "hover" : undefined}
                        whileTap="tapMic"
                        variants={variants.button}
                        initial="idle"
                        animate={isRecording ? "recording" : "idle"}
                        // onPointerDown={() => {
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
      </motion.div>
    </OptionalElement>
  );
};

export default BottomInput;

const variants: Record<string, Variants> = {
  button: {
    hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)", transition: { duration: 0.2 } },
    tap: { scale: 0.9, backgroundColor: "rgba(255,255,255,0.3)", transition: { type: "spring", stiffness: 400, damping: 10 } },
    tapMic: { scale: 1.2 },
    idle: { scale: 1, backgroundColor: "rgba(0,0,0,0)", boxShadow: "0px 0px 0px rgba(239, 68, 68, 0)", color: "rgba(255, 255, 255, 0.7)", transition: { duration: 0.3 } },
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
    idle: { scale: 1, backgroundColor: "rgba(0,0,0,0)", boxShadow: "0px 0px 0px rgba(239, 68, 68, 0)", transition: { duration: 0.3 } },
  },
  container: {
    idle: { boxShadow: "0px 0px 0px rgba(239, 68, 68, 0)", borderColor: "rgba(255, 255, 255, 0.3)", transition: { duration: 0.3 } },
    recordingContainer: {
      boxShadow: ["0px 0px 0px rgba(239, 68, 68, 0.2)", "0px 0px 12px rgba(239, 68, 68, 0.6)", "0px 0px 0px rgba(239, 68, 68, 0.2)"],
      borderColor: ["rgba(255, 255, 255, 0.3)", "rgba(239, 68, 68, 0.6)", "rgba(255, 255, 255, 0.3)"],
      transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
    },
  },
  expandedContainer: { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.2 } }, exit: { opacity: 0, transition: { duration: 0.2 } } },
  recordingIndicator: {
    initial: { opacity: 0, scale: 0.5 },
    animate: { opacity: [0.5, 1, 0.5], scale: [1, 1.05, 1], transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" } },
    exit: { opacity: 0, scale: 0, transition: { duration: 0.2 } },
  },
};
