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
import type { CharacterData } from "@player/types/book";
import { askCall } from "@player/askCall";
import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import { useBottomInput } from "@player/stores/modals/bottomInput.store";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { getSavedLocation } from "@player/helpers/paragraphsNavigation";

const hasReaderMetCharacter = (character: CharacterData, chapter: number, paragraph: number): boolean => {
  return character.infoPerChapter.some((infoPerChapter) => {
    const encounteredParagraphs = [...infoPerChapter.paragraphsWhereSpotted, ...infoPerChapter.paragraphsWhereTalking, ...(infoPerChapter.paragraphsWhereEnters ?? [])];

    if (infoPerChapter.chapter < chapter) {
      return encounteredParagraphs.length > 0;
    }

    if (infoPerChapter.chapter === chapter) {
      return encounteredParagraphs.some((encounterParagraph) => encounterParagraph <= paragraph);
    }

    return false;
  });
};

interface BottomInputProps {
  className?: string;
}

const BottomInput: React.FC<BottomInputProps> = ({ className }) => {
  const { t } = useTranslation();

  const { value, setValue } = useBottomInput();
  const [isRecording, setIsRecording] = useState(false);
  const [isDeepResearchActive, setIsDeepResearchActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { pauseAllTimers, startAllTimers, showAllElements } = useElementVisibilityStore();
  const { openModal: openSearchModal, closeModal: closeSearchModal, isOpen: isSearchModalOpen, setQuery: setSearchQuery } = useSearchModal();
  const { openModal: openDeepResearchModal, setContent: setDeepResearchContent, closeModal: closeDeepResearchModal, isOpen: isDeepResearchModalOpen } = useDeepResearchModal();
  const { closeModal: closeCharacterModal, isOpen: isCharacterModalOpen } = useCharacterModal();
  const { openModal: openApiKeyModal } = useApiKeyModal();

  const { startRecording, stopRecording, response } = useRealtime();
  const { location } = useLocation();
  const furthestLocation = getSavedLocation();

  const allCharacters = useMemo(() => {
    try {
      return getCharactersData();
    } catch (error) {
      console.error("Failed to load characters for mentions:", error);
      return [];
    }
  }, []);

  const availableCharacterNames = useMemo(() => {
    if (!allCharacters.length) return [];
    return allCharacters
      .filter((character) => hasReaderMetCharacter(character, furthestLocation.chapter, furthestLocation.paragraph))
      .map((character) => character.characterName)
      .filter(Boolean);
  }, [allCharacters, furthestLocation.chapter, furthestLocation.paragraph]);

  const [mentionState, setMentionState] = useState<{ isActive: boolean; query: string; startIndex: number }>({ isActive: false, query: "", startIndex: -1 });
  const [highlightedMention, setHighlightedMention] = useState(0);
  const mentionListRef = useRef<HTMLUListElement | null>(null);

  const updateSearchQueryForInput = useCallback(
    (inputValue: string) => {
      if (isDeepResearchActive) return;
      if (isRecording) return;

      const trimmedValue = inputValue.trim();
      startTransition(() => {
        if (trimmedValue.length >= 2) {
          setSearchQuery(trimmedValue);
        } else {
          setSearchQuery("");
        }
      });
    },
    [isDeepResearchActive, isRecording, setSearchQuery],
  );

  const filteredCharacters = useMemo(() => {
    if (!mentionState.isActive) return [];
    const query = mentionState.query.toLowerCase();
    return availableCharacterNames.filter((name) => name.toLowerCase().includes(query));
  }, [availableCharacterNames, mentionState.isActive, mentionState.query]);

  const handleActivity = useCallback(() => {
    pauseAllTimers(true);
    showAllElements();
  }, [pauseAllTimers, showAllElements]);

  const openModalWithFocus = useCallback(() => {
    if (isDeepResearchActive) return;

    if (isDeepResearchModalOpen) {
      closeDeepResearchModal();
    }

    if (isCharacterModalOpen) {
      closeCharacterModal();
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
  }, [isDeepResearchActive, isSearchModalOpen, openSearchModal, value, isDeepResearchModalOpen, closeDeepResearchModal, isCharacterModalOpen, closeCharacterModal]);

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
      updateSearchQueryForInput(newValue);

      const selectionIndex = e.target.selectionStart ?? newValue.length;
      const textBeforeCaret = newValue.slice(0, selectionIndex);
      const mentionMatch = textBeforeCaret.match(/(^|\s)@([^-@\s]*)$/);

      if (mentionMatch) {
        const query = mentionMatch[2];
        const atIndex = selectionIndex - query.length - 1;
        setMentionState({ isActive: true, query, startIndex: atIndex });
      } else if (mentionState.isActive) {
        setMentionState({ isActive: false, query: "", startIndex: -1 });
      }
    },
    [mentionState.isActive, setValue, updateSearchQueryForInput],
  );

  const handleInputInteraction = useCallback(() => {
    handleActivity();

    if (isDeepResearchActive) return;

    openModalWithFocus();
  }, [handleActivity, isDeepResearchActive, openModalWithFocus]);

  const executeDeepResearch = useCallback(
    (query: string) => {
      setIsThinking(true);

      if (isCharacterModalOpen) {
        closeCharacterModal();
      }

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
    [location, setDeepResearchContent, t, openDeepResearchModal, isCharacterModalOpen, closeCharacterModal],
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

  useEffect(() => {
    if (!mentionState.isActive) {
      setHighlightedMention(0);
    } else {
      setHighlightedMention(0);
    }
  }, [mentionState.isActive, mentionState.query]);

  const closeMentions = useCallback(() => {
    setMentionState({ isActive: false, query: "", startIndex: -1 });
    setHighlightedMention(0);
  }, []);

  const insertMention = useCallback(
    (name: string) => {
      if (!mentionState.isActive || mentionState.startIndex < 0) {
        closeMentions();
        return;
      }

      const mentionText = `@${name}`;
      const before = value.slice(0, mentionState.startIndex);
      const after = value.slice(mentionState.startIndex + mentionState.query.length + 1);
      const withMention = `${before}${mentionText} ${after}`;

      console.log("335: withMention BANG!", withMention);

      setValue(withMention);
      updateSearchQueryForInput(withMention);
      closeMentions();

      const inputEl = inputRef.current;
      if (inputEl) {
        queueMicrotask(() => {
          const newCaretPosition = `${before}${mentionText} `.length;
          inputEl.focus();
          inputEl.setSelectionRange(newCaretPosition, newCaretPosition);
        });
      }
    },
    [closeMentions, mentionState.isActive, mentionState.query, mentionState.startIndex, setValue, updateSearchQueryForInput, value],
  );

  useEffect(() => {
    if (!mentionState.isActive) return;
    const listElement = mentionListRef.current;
    if (!listElement) return;
    const child = listElement.children[highlightedMention] as HTMLElement | undefined;
    if (child) {
      child.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedMention, mentionState.isActive]);

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!mentionState.isActive || filteredCharacters.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedMention((prev) => (prev + 1) % filteredCharacters.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedMention((prev) => (prev - 1 + filteredCharacters.length) % filteredCharacters.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const selected = filteredCharacters[highlightedMention];
        if (selected) insertMention(selected);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeMentions();
      }
    },
    [closeMentions, filteredCharacters, highlightedMention, insertMention, mentionState.isActive],
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
              <AnimatePresence>
                {mentionState.isActive && (
                  <motion.ul
                    key="mention-list"
                    className="absolute bottom-full left-0 right-0 mb-2 bg-black/85 border border-white/20 rounded-xl shadow-lg overflow-hidden z-50 max-h-56 overflow-y-auto"
                    ref={(node) => {
                      mentionListRef.current = node;
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.15 }}
                  >
                    {filteredCharacters.length > 0 ? (
                      filteredCharacters.map((characterName, index) => (
                        <li
                          key={characterName}
                          className={cn("px-3 py-2 cursor-pointer text-sm", index === highlightedMention ? "bg-white/15" : "bg-transparent")}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(characterName);
                          }}
                          onMouseEnter={() => setHighlightedMention(index)}
                        >
                          {characterName}
                        </li>
                      ))
                    ) : (
                      <li className="px-3 py-2 text-sm text-white/70">{t("mentions_no_characters_yet", "No characters have been introduced yet.")}</li>
                    )}
                  </motion.ul>
                )}
              </AnimatePresence>
              <input
                id="bottom-input"
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                onFocus={handleInputInteraction}
                onKeyDown={handleInputKeyDown}
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
