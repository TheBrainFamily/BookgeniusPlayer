import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Send, Telescope, Expand } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { useRealtime } from "@/context/RealtimeContext";
import { CURRENT_BOOK } from "@/consts";
import { useLocation } from "@/state/LocationContext";
import { deepResearchCall } from "@/deepResearchCall";
import { useIsMobileOrTablet } from "@/hooks/useIsMobileOrTablet";
import { useModal } from "@/context/ModalContext";
import useDeviceOrientation from "@/hooks/useDeviceOrientation";

interface SubmitMessageData {
  query: string;
  filter: { chapterFrom: number; chapterTo: number | undefined; paragraphFrom: number; paragraphTo: number | undefined; bookSlug: string };
}

interface BottomInputProps {
  placeholder?: string;
  onSubmit?: (message: SubmitMessageData) => void;
}

const BottomInput: React.FC<BottomInputProps> = ({ placeholder = "Type something...", onSubmit }) => {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(true);
  const [isDeepResearchActive, setIsDeepResearchActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isRightNotesBlankHidden, setIsRightNotesBlankHidden] = useState(false);

  const { openSearchModal, closeModal, currentModal, performSearchInModal, openDeepResearchModal } = useModal();

  const { isLandscape } = useDeviceOrientation();
  const { startRecording, stopRecording, response } = useRealtime();
  const { location } = useLocation();
  const { chapter: currentChapter, paragraph: currentParagraph } = location;

  const inputRef = useRef<HTMLInputElement>(null);

  const isCollapsed = isLandscape && !isInputExpanded;

  useEffect(() => {
    setIsInputExpanded(!isLandscape);
  }, [isLandscape]);

  useEffect(() => {
    // Add keyboard listener for Cmd+F / Ctrl+F
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "f" || event.key === "F") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (inputRef.current) inputRef.current.focus();
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (response && !isRecording) {
      setValue(response);
      if (currentModal?.type === "search") {
        performSearchInModal(response);
      }
    }
  }, [response, isRecording, currentModal?.type, performSearchInModal]);

  const isMobileOrTablet = useIsMobileOrTablet();

  useEffect(() => {
    setIsRightNotesBlankHidden(isMobileOrTablet);
  }, [isMobileOrTablet]);

  const toggleDeepResearch = () => {
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

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

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
          openDeepResearchModal(deepResearchResponse, true, true); // Open modal with the response
        })
        .catch((error) => console.error("Deep research failed:", error))
        .finally(() => {
          setIsThinking(false);
        });
    } else if (onSubmit) {
      onSubmit({
        // Send the structured data
        query: trimmedValue,
        filter: { chapterFrom: 1, chapterTo: currentChapter, paragraphFrom: 1, paragraphTo: currentParagraph, bookSlug: CURRENT_BOOK },
      });
      setValue(""); // Clear after general submission
    }
  };

  const handleRecordingStart = useCallback(() => {
    if (isRecording) return;
    setIsRecording(true);
    if (isLandscape && !isInputExpanded) setIsInputExpanded(true);
    setValue("");
    // Clear search if starting voice input while search modal is open
    if (currentModal?.type === "search") performSearchInModal("");
    startRecording().catch((error) => {
      console.error("Error starting recording:", error);
      setIsRecording(false);
    });
  }, [isRecording, startRecording, isLandscape, isInputExpanded, currentModal?.type, performSearchInModal]);

  const handleRecordingEnd = useCallback(() => {
    if (!isRecording) return;
    setTimeout(() => {
      stopRecording()
        .catch((error) => console.error("Error stopping recording:", error))
        .finally(() => setIsRecording(false));
    }, 150);
  }, [isRecording, stopRecording]);

  const toggleInputExpanded = () => {
    if (isLandscape) {
      const nextExpanded = !isInputExpanded;
      setIsInputExpanded(nextExpanded);
      if (nextExpanded) {
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        inputRef.current?.blur();
      }
    }
  };

  return (
    <footer
      className={cn(
        "flex flex-row gap-2 justify-center mx-auto pl-2 pr-2 md:pr-0 xl:px-4 md:pl-4 max-w-[120rem] w-full",
        "fixed bottom-0 inset-x-0 z-50 transition-all duration-200 ease-out",
        "bg-white/0 flex",
        isCollapsed ? "w-auto right-4 left-auto rounded-full p-1" : "w-full",
        "justify-around",
        "optional-element",
      )}
    >
      {/* ToDo: Remove when layout will be refactored */}
      <div id="left-notes-blank" className="hidden md:block md:flex-1 max-w-[700px]" />
      <div className="flex-2 max-w-[900px]">
        <div
          className={cn(
            "keyboard-safe-area",
            "bg-gradient-to-b from-black/0 to-[var(--footer-stop)]",
            "rounded-br-lg rounded-bl-lg",
            isCollapsed ? "p-0" : "px-4 pt-3 pb-1",
            "transition-[--footer-stop] duration-300 ease-in-out",
          )}
          style={{ "--footer-stop": isFocused ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.4)" } as React.CSSProperties}
        >
          {isCollapsed ? (
            <motion.button
              type="button"
              aria-label="Expand input"
              className="p-3 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shadow-md"
              whileTap={{ scale: 0.92 }}
              onClick={toggleInputExpanded}
            >
              <Expand size={20} />
            </motion.button>
          ) : (
            // --- Expanded State ---
            <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2 h-10">
              <input /* Input field - adjusted styles */
                id="bottom-input"
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                onFocus={handleFocus} // Remove if not needed
                onBlur={handleBlur} // Remove if not needed
                placeholder={isRecording ? "Listening..." : isDeepResearchActive ? "Enter deep research query..." : placeholder}
                className={cn("flex-grow p-0 pr-1 outline-none transition-colors bg-transparent text-black ", "text-base", isRecording ? "opacity-50" : "")}
                disabled={isRecording || isThinking}
                autoComplete="off"
              />
              {/* Combined button container */}
              <div className="flex items-center space-x-2">
                {/* Deep Research Button - Moved here */}
                <button
                  type="button"
                  aria-pressed={isDeepResearchActive}
                  className={cn(
                    "py-1 px-3 rounded-lg flex items-center transition-colors duration-200 h-8 cursor-pointer",
                    isDeepResearchActive
                      ? "bg-orange-500 text-white hover:bg-orange-600"
                      : "bg-secondary/80  border-transparent text-gray-600 hover:bg-secondary/50 hover:border-gray-400",
                    isThinking ? "opacity-50 cursor-default" : "",
                  )}
                  onClick={toggleDeepResearch}
                  disabled={isThinking || isRecording}
                >
                  <Telescope size={16} className="mr-1.5 flex-shrink-0" />
                  <span className="text-sm whitespace-nowrap leading-none">Research</span>
                  {isThinking && <div className="w-3 h-3 ml-2 border-2 border-t-transparent rounded-full animate-spin border-current"></div>}
                </button>
                {/* Send/Mic Button Logic - Unchanged */}
                {value.trim() && !isRecording ? (
                  <motion.button /* Send Button */
                    type="submit"
                    aria-label="Send message"
                    className="p-3 rounded-full bg-blue-500 text-white flex items-center justify-center shadow hover:bg-blue-600"
                    whileTap={{ scale: 0.92 }}
                    disabled={isThinking}
                  >
                    <Send size={18} />
                  </motion.button>
                ) : (
                  <motion.button /* Mic Button */
                    type="button"
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                    className={cn(
                      "p-3 rounded-full flex items-center justify-center shadow transition-colors duration-150 cursor-pointer",
                      isRecording ? "bg-red-500 text-white animate-pulse" : "bg-secondary/80 text-secondary-foreground hover:bg-secondary/50",
                    )}
                    whileTap={{ scale: isRecording ? 1 : 0.92 }}
                    onPointerDown={(e) => {
                      if (e.pointerType === "touch") e.preventDefault();
                      handleRecordingStart();
                    }}
                    onPointerUp={() => {
                      if (isRecording) handleRecordingEnd();
                    }}
                    onPointerLeave={() => {
                      if (isRecording) handleRecordingEnd();
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={isThinking}
                  >
                    <Mic size={18} />
                  </motion.button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ToDo: Remove when layout will be refactored */}
      {!isRightNotesBlankHidden && <div id="right-notes-blank" className="hidden xl:block xl:flex-1 max-w-[700px]" />}
    </footer>
  );
};

export default BottomInput;
