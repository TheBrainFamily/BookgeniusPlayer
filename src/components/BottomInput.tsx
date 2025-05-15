import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Send, Telescope, Expand } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils"; // Assuming you have this utility
import { useRealtime } from "@/context/RealtimeContext"; // Adjust path
// Removed WebSocket dependency if isLoading isn't used in footer
// import { Message, useWebSocket } from "@/context/WebSocketContext"; // Adjust path
import { CURRENT_BOOK } from "@/consts"; // Adjust path
import { useLocation } from "@/state/LocationContext"; // Adjust path
import { showSearchModal, performSearch, hideSearchModal, isSearchActive } from "@/searchModal"; // Adjust path
import { deepResearchCall } from "@/deepResearchCall"; // Adjust path
import { isMobileOrTabletDevice } from "@/utils/isMobileOrTabletDevice";

// --- Helper Hook for Landscape Detection ---
const useDeviceOrientation = () => {
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const landscape = window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches;
      setIsLandscape(landscape);
    };
    checkOrientation();
    const mediaQueryList = window.matchMedia("(orientation: landscape) and (max-height: 500px)");
    mediaQueryList.addEventListener("change", checkOrientation);
    return () => mediaQueryList.removeEventListener("change", checkOrientation);
  }, []);
  return { isLandscape };
};

// Type for the onSubmit prop data structure (assuming Message was defined in WebSocket context)
interface SubmitMessageData {
  query: string;
  filter: { chapterFrom: number; chapterTo: number | undefined; paragraphFrom: number; paragraphTo: number | undefined; bookSlug: string };
}

interface BottomInputProps {
  placeholder?: string;
  onSubmit?: (message: SubmitMessageData) => void; // Use the specific data type
  className?: string; // Keep for potential footer styling overrides
  onShowDeepResearch: (result: string) => void;
  // No longer needs onCloseDeepResearch unless used elsewhere
  onCloseDeepResearch?: () => void; // ToDo: remove if not needed
}

export function BottomInput({ placeholder = "Type something...", onSubmit, className, onShowDeepResearch }: BottomInputProps) {
  const [value, setValue] = useState("");
  // isFocused might not be needed anymore if backdrop is removed
  const [isFocused, setIsFocused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(true);
  const [isDeepResearchActive, setIsDeepResearchActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isRightNotesBlankHidden, setIsRightNotesBlankHidden] = useState(false);

  const { isLandscape } = useDeviceOrientation();
  const { startRecording, stopRecording, response } = useRealtime();
  // Removed useWebSocket - add back ONLY if isLoading indicator is needed IN FOOTER
  // const { isLoading } = useWebSocket();
  const { location } = useLocation();
  const { chapter: currentChapter, paragraph: currentParagraph } = location;

  const inputRef = useRef<HTMLInputElement>(null);

  const isCollapsed = isLandscape && !isInputExpanded;

  // --- Effects ---
  useEffect(() => {
    setIsInputExpanded(!isLandscape);
  }, [isLandscape]);

  useEffect(() => {
    if (response && !isRecording) {
      setValue(response);
    }
  }, [response, isRecording]);

  useEffect(() => {
    if (isMobileOrTabletDevice()) setIsRightNotesBlankHidden(true);
  }, []);

  // --- Event Handlers ---
  // const handleFocus = () => setIsFocused(true); // Remove if not needed
  // const handleBlur = () => setIsFocused(false); // Remove if not needed

  const toggleDeepResearch = () => {
    setIsDeepResearchActive(!isDeepResearchActive);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setValue(newVal);

    // Search modal logic (keep as is)
    if (newVal.trim().length > 2 && !isDeepResearchActive) {
      if (!isSearchActive()) {
        showSearchModal();
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      performSearch(newVal);
      const modalInput = document.getElementById("search-input") as HTMLInputElement | null;
      if (modalInput) modalInput.value = newVal;
    } else if (newVal.trim().length === 0 && isSearchActive()) {
      hideSearchModal();
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
    if (!trimmedValue || !onSubmit) return;

    if (isSearchActive()) hideSearchModal();

    if (isDeepResearchActive) {
      setIsThinking(true);
      deepResearchCall(trimmedValue, location)
        .then(onShowDeepResearch) // Simplified .then
        .catch((error) => console.error("Deep research failed:", error))
        .finally(() => {
          setIsThinking(false);
          setIsDeepResearchActive(false); // Turn off after call completes
        });
    } else {
      onSubmit({
        // Send the structured data
        query: trimmedValue,
        filter: { chapterFrom: 1, chapterTo: currentChapter, paragraphFrom: 1, paragraphTo: currentParagraph, bookSlug: CURRENT_BOOK },
      });
    }
    setValue("");
  };

  const handleRecordingStart = useCallback(() => {
    if (isRecording) return;
    setIsRecording(true);
    if (isLandscape && !isInputExpanded) setIsInputExpanded(true);
    setValue("");
    startRecording().catch((error) => {
      console.error("Error starting recording:", error);
      setIsRecording(false);
    });
  }, [isRecording, startRecording, isLandscape, isInputExpanded]);

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
        "flex flex-row gap-2 justify-center mx-auto px-2 md:px-4 max-w-[120rem] w-full",
        "fixed bottom-0 inset-x-0 z-50 transition-all duration-200 ease-out",
        "bg-white/0 flex",
        isCollapsed ? "w-auto right-4 left-auto rounded-full p-1" : "w-full",
        "justify-around",
        className,
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
      {!isRightNotesBlankHidden && <div id="right-notes-blank" className="hidden lg:block lg:flex-1 max-w-[700px]" />}
    </footer>
  );
}
