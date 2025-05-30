import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Send, Telescope } from "lucide-react";
import { motion, Variants, AnimatePresence } from "motion/react";

import { cn } from "@/lib/utils";
import { useRealtime } from "@/context/RealtimeContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CURRENT_BOOK } from "@/consts";
import { useLocation } from "@/state/LocationContext";
import { deepResearchCall } from "@/deepResearchCall";
import { useModal } from "@/context/ModalProvider";

interface SubmitMessageData {
  query: string;
  filter: { chapterFrom: number; chapterTo: number | undefined; paragraphFrom: number; paragraphTo: number | undefined; bookSlug: string };
}

interface BottomInputProps {
  onSubmit?: (message: SubmitMessageData) => void;
  className?: string;
}

const BottomInput: React.FC<BottomInputProps> = ({ onSubmit, className }) => {
  const [value, setValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isDeepResearchActive, setIsDeepResearchActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const { openSearchModal, closeModal, currentModal, performSearchInModal, openDeepResearchModal } = useModal();

  const { startRecording, stopRecording, response } = useRealtime();
  const { location } = useLocation();
  const { chapter: currentChapter, paragraph: currentParagraph } = location;

  const inputRef = useRef<HTMLInputElement>(null);
  // Ref to track last activity time
  const lastActivityRef = useRef<number>(Date.now());
  // Ref for inactivity timer
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update last activity time
  const updateLastActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    // Reset any existing inactivity timer
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
      if (currentModal?.type === "search") {
        performSearchInModal(response);
      }
    }
  }, [response, isRecording, currentModal?.type, performSearchInModal, updateLastActivity]);

  const toggleDeepResearch = () => {
    updateLastActivity();
    const newDeepResearchState = !isDeepResearchActive;
    setIsDeepResearchActive(newDeepResearchState);
    if (newDeepResearchState && currentModal?.type === "search") {
      closeModal(); // Close search modal if deep research is activated
    }
    if (newDeepResearchState) {
      setValue(""); // Clear input when activating deep research
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateLastActivity();
    const newVal = e.target.value;
    setValue(newVal);

    if (isDeepResearchActive) return;

    const trimmedValue = newVal.trim();
    if (!trimmedValue.length && currentModal?.type === "search") {
      performSearchInModal("");
      return;
    }

    if (currentModal?.type !== "search") {
      openSearchModal(true, true, trimmedValue);
    } else {
      performSearchInModal(trimmedValue);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    updateLastActivity();

    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    if (currentModal?.type === "search") {
      performSearchInModal(trimmedValue);
      return;
    }

    if (isDeepResearchActive) {
      setIsThinking(true);
      deepResearchCall(trimmedValue, location)
        .then((deepResearchResponse) => {
          openDeepResearchModal(deepResearchResponse, true, true);
        })
        .catch((error) => console.error("Deep research failed:", error))
        .finally(() => {
          setIsThinking(false);
        });
    } else if (onSubmit) {
      onSubmit({ query: trimmedValue, filter: { chapterFrom: 1, chapterTo: currentChapter, paragraphFrom: 1, paragraphTo: currentParagraph, bookSlug: CURRENT_BOOK } });
      setValue(""); // Clear after submission
    }
  };

  const handleRecordingStart = useCallback(() => {
    if (isRecording) return;

    updateLastActivity();
    setIsRecording(true);

    setValue("");

    // Clear search if starting voice input while search modal is open
    if (currentModal?.type === "search") performSearchInModal("");

    startRecording().catch((error) => {
      console.error("Error starting recording:", error);
      setIsRecording(false);
    });
  }, [isRecording, startRecording, currentModal?.type, performSearchInModal, updateLastActivity]);

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
    <div className={cn("transition-all duration-300 ease-out w-full flex justify-center", className)}>
      <motion.div className={cn("bg-black/70 textured-bg border shadow-xl text-white border-white/30 w-full rounded-3xl px-3 py-2")}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key="expanded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <form onSubmit={handleSubmit} className="flex items-center space-x-2 min-w-[280px] sm:min-w-[350px]">
              <input
                id="bottom-input"
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                placeholder={isRecording ? "Nasłuchiwanie.." : isDeepResearchActive ? "Wprowadź wyszukanie Deep Research..." : "Poszukaj albo zapytaj"}
                className={cn("flex-grow bg-transparent text-white outline-none px-2 py-1", isRecording ? "opacity-50" : "")}
                disabled={isRecording || isThinking}
                autoComplete="off"
                onFocus={updateLastActivity}
              />

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
                        variants={buttonVariants}
                        onClick={toggleDeepResearch}
                        disabled={isThinking || isRecording}
                      >
                        <Telescope size={18} />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent>Deep Research - analizuje szczegółowo cały tekst</TooltipContent>
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
                          variants={buttonVariants}
                          disabled={isThinking}
                        >
                          <Send size={18} />
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent>Wyślij wiadomość</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          type="button"
                          className={cn("p-2 rounded-full flex items-center justify-center cursor-pointer", isRecording ? "text-red-400" : "text-white/70")}
                          whileHover={!isRecording ? "hover" : undefined}
                          whileTap={!isRecording ? "tap" : undefined}
                          variants={buttonVariants}
                          animate={isRecording ? "recording" : "idle"}
                          onClick={() => {
                            if (isRecording) {
                              setIsRecording(false);
                              handleRecordingEnd();
                            }
                            setIsRecording(true);
                            handleRecordingStart();
                          }}
                          disabled={isThinking}
                        >
                          <Mic size={18} />
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent>{isRecording ? "Zatrzymaj nagrywanie" : "Rozpocznij nagrywanie"}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </form>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default BottomInput;

const buttonVariants: Variants = {
  hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)", transition: { duration: 0.2 } },
  tap: { scale: 0.9, backgroundColor: "rgba(255,255,255,0.3)", transition: { type: "spring", stiffness: 400, damping: 10 } },
  idle: { scale: 1 },
  recording: {
    scale: [1, 1.1, 1],
    backgroundColor: ["rgba(239, 68, 68, 0.2)", "rgba(239, 68, 68, 0.4)", "rgba(239, 68, 68, 0.2)"],
    boxShadow: ["0px 0px 0px rgba(239, 68, 68, 0.4)", "0px 0px 15px rgba(239, 68, 68, 0.6)", "0px 0px 0px rgba(239, 68, 68, 0.4)"],
    transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
  },
};
