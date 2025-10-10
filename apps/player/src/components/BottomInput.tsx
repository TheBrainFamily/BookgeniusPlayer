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
import { useDeepResearchModal } from "@player/stores/modals/researchModal.store";
import { OptionalElement } from "./OptionalElement";
import { useElementVisibilityStore } from "@player/stores/elementVisibility.store";
import type { CharacterData } from "@player/types/book";
import { askStream } from "@player/askStream";
import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import { useBottomInput } from "@player/stores/modals/bottomInput.store";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { getSavedLocation } from "@player/helpers/paragraphsNavigation";
import { MicrophoneVisualizer } from "./MicrophoneVisualizer";
import DebugMicPlaybackButton from "./DebugMicPlaybackButton";

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
  const [isRealtimeConnecting, setIsRealtimeConnecting] = useState(false);
  const [isDeepResearchActive, setIsDeepResearchActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isMicrophoneReady, setIsMicrophoneReady] = useState(false);
  const [micToastVisible, setMicToastVisible] = useState(false);
  const [micToastText, setMicToastText] = useState("");
  const micToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldSelectAllRef = useRef(false);

  const { pauseAllTimers, startAllTimers, showAllElements, setIsTimersPausedSticky } = useElementVisibilityStore();
  const { openModal: openSearchModal, closeModal: closeSearchModal, isOpen: isSearchModalOpen, setQuery: setSearchQuery, clearModal } = useSearchModal();
  const {
    openModal: openDeepResearchModal,
    setContent: setDeepResearchContent,
    content: deepResearchContent,
    setLoading: setDeepResearchLoading,
    closeModal: closeDeepResearchModal,
    clearModal: clearDeepResearchModal,
    isOpen: isDeepResearchModalOpen,
    setShowDiveDeeperCTA,
    setDiveDeeperLoading,
    setDiveDeeperHandler,
    setType: setDeepResearchType,
  } = useDeepResearchModal();
  const { closeModal: closeCharacterModal, isOpen: isCharacterModalOpen } = useCharacterModal();
  // No local API key gating for voice; token fetched server-side

  const { startRecording, stopRecording, setAskHandler, isRecording, isSessionReady, audioAnalyser, primeMicrophone } = useRealtime();
  const { location } = useLocation();
  const saved = getSavedLocation();
  const furthestLocation = saved ?? location;

  const showMicDebug = useMemo(() => {
    // Show in dev builds; allow override via URL ?micDebug=1 in any env
    if (import.meta.env.DEV) return true;
    try {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("micDebug");
      return v === "1" || v === "true";
    } catch {}
    return false;
  }, []);

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

      if (isDeepResearchModalOpen) {
        closeDeepResearchModal();
        clearDeepResearchModal();
      }

      const trimmedValue = inputValue.trim();
      startTransition(() => {
        if (trimmedValue.length >= 2) {
          openSearchModal(true, true, inputValue);
          setSearchQuery(trimmedValue);
        } else {
          clearModal();
          setSearchQuery("");
        }
      });
    },
    [isDeepResearchActive, isRecording, setSearchQuery, openSearchModal, clearModal, isDeepResearchModalOpen, closeDeepResearchModal, clearDeepResearchModal],
  );

  const filteredCharacters = useMemo(() => {
    if (!mentionState.isActive) return [];
    const query = mentionState.query.toLowerCase();
    return availableCharacterNames.filter((name) => name.toLowerCase().includes(query));
  }, [availableCharacterNames, mentionState.isActive, mentionState.query]);

  const handleActivity = useCallback(() => {
    setIsTimersPausedSticky(true);
    pauseAllTimers();
    showAllElements();
  }, [pauseAllTimers, showAllElements, setIsTimersPausedSticky]);

  const openModalWithFocus = useCallback(() => {
    if (isDeepResearchActive && !deepResearchContent) return;

    if (isDeepResearchModalOpen) {
      closeDeepResearchModal();
    }

    if (isCharacterModalOpen) {
      closeCharacterModal();
    }

    if (!isSearchModalOpen && value.length > 2) {
      if (deepResearchContent) {
        openDeepResearchModal(deepResearchContent, true, true, "deep");
      } else {
        openSearchModal(true, true, value.trim());
      }
    }

    if (inputRef.current == null) return;

    const inputEl = inputRef.current;
    inputEl.focus();

    // Use microtask to ensure DOM is updated before setting selection
    queueMicrotask(() => {
      if (!inputEl) return;
      if (shouldSelectAllRef.current) {
        inputEl.select();
        shouldSelectAllRef.current = false;
      } else {
        const length = inputEl.value.length;
        inputEl.setSelectionRange(length, length);
      }
    });
  }, [
    isDeepResearchActive,
    isSearchModalOpen,
    openSearchModal,
    value,
    isDeepResearchModalOpen,
    closeDeepResearchModal,
    isCharacterModalOpen,
    closeCharacterModal,
    deepResearchContent,
  ]);

  const sseRef = useRef<EventSource | null>(null);
  const streamingBufferRef = useRef<string>("");
  const switchedToDeepResearchRef = useRef<boolean>(false);
  const hasShownFirstChunkRef = useRef<boolean>(false);
  const lastAskedQueryRef = useRef<string>("");

  useEffect(() => {
    return () => {
      sseRef.current?.close();
      if (micToastTimerRef.current) clearTimeout(micToastTimerRef.current);
    };
  }, []);

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

    if (isDeepResearchActive && !deepResearchContent) return;

    if (shouldSelectAllRef.current) return;

    openModalWithFocus();
  }, [handleActivity, isDeepResearchActive, openModalWithFocus, deepResearchContent, shouldSelectAllRef]);

  const executeDeepResearch = useCallback(
    (query: string) => {
      setIsThinking(true);

      if (isCharacterModalOpen) {
        closeCharacterModal();
      }

      setDeepResearchType("deep");
      openDeepResearchModal(undefined, true, true, "deep");
      setDeepResearchLoading(true);
      setShowDiveDeeperCTA(false);
      setDiveDeeperLoading(false);
      setDiveDeeperHandler(undefined);

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
    [
      location,
      setDeepResearchContent,
      setDeepResearchLoading,
      setShowDiveDeeperCTA,
      setDiveDeeperLoading,
      setDiveDeeperHandler,
      t,
      openDeepResearchModal,
      isCharacterModalOpen,
      closeCharacterModal,
      setDeepResearchType,
    ],
  );

  const handleDiveDeeper = useCallback(async () => {
    const query = lastAskedQueryRef.current;
    if (!query) return;

    setDiveDeeperLoading(true);
    try {
      const text = await deepResearchCall(query, location);
      setDeepResearchType("deep");

      const finalText = text && text.trim().length > 0 ? text : t("deep_research_error");
      setDeepResearchContent(finalText);
      setShowDiveDeeperCTA(false);
      setDiveDeeperHandler(undefined);
    } catch (error) {
      console.error("Deep research CTA failed:", error);
      setDeepResearchContent(t("deep_research_error"));
      setShowDiveDeeperCTA(true);
      setDiveDeeperHandler(handleDiveDeeper);
    } finally {
      setDiveDeeperLoading(false);
    }
  }, [location, setDeepResearchContent, setDiveDeeperHandler, setDiveDeeperLoading, setShowDiveDeeperCTA, t, setDeepResearchType]);

  const handleAsk = useCallback(
    async (query: string) => {
      setIsThinking(true);
      setDeepResearchType("ask");
      openDeepResearchModal(undefined, true, true, "ask");
      setDeepResearchLoading(true);
      streamingBufferRef.current = "";
      switchedToDeepResearchRef.current = false;
      hasShownFirstChunkRef.current = false;
      lastAskedQueryRef.current = query;
      setShowDiveDeeperCTA(false);
      setDiveDeeperLoading(false);
      setDiveDeeperHandler(undefined);

      // cancel any previous stream
      sseRef.current?.close();
      sseRef.current = null;

      sseRef.current = askStream(query, location, {
        onMeta: (needMore) => {
          setShowDiveDeeperCTA(false);
          setDiveDeeperHandler(undefined);
          if (needMore) {
            sseRef.current?.close();
            sseRef.current = null;
            // Hand off to deep research path
            // Keep loading state; deepResearchCall will update content
            // and then clear loading on finish
            switchedToDeepResearchRef.current = true;
            setDeepResearchLoading(true);
            executeDeepResearch(query);
          }
        },
        onChunk: (delta) => {
          streamingBufferRef.current += delta;
          if (!hasShownFirstChunkRef.current) {
            setDeepResearchLoading(false);
            hasShownFirstChunkRef.current = true;
          }
          setDeepResearchContent(streamingBufferRef.current);
        },
        onDone: (final) => {
          if (!switchedToDeepResearchRef.current) {
            const finalText = final?.text ?? streamingBufferRef.current;
            if (finalText) {
              setDeepResearchContent(finalText);
              setShowDiveDeeperCTA(finalText.trim().length > 0);
              if (finalText.trim().length > 0) {
                setDiveDeeperHandler(handleDiveDeeper);
              }
              setDiveDeeperLoading(false);
            } else {
              setDeepResearchLoading(false);
              setShowDiveDeeperCTA(false);
            }
            if (!hasShownFirstChunkRef.current) {
              setDeepResearchLoading(false);
            }
            setIsThinking(false);
          }
          sseRef.current = null;
        },
        onError: (err) => {
          console.error("SSE error", err);
          setIsThinking(false);
          setDeepResearchContent(t("ask_error"));
          setDeepResearchLoading(false);
          setShowDiveDeeperCTA(false);
          setDiveDeeperHandler(undefined);
          sseRef.current = null;
        },
      });
    },
    [
      location,
      openDeepResearchModal,
      setDeepResearchContent,
      setDeepResearchLoading,
      setShowDiveDeeperCTA,
      setDiveDeeperLoading,
      setDiveDeeperHandler,
      t,
      executeDeepResearch,
      handleDiveDeeper,
      setDeepResearchType,
    ],
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

  // Register handleAsk so Realtime tool can trigger the same flow
  useEffect(() => {
    setAskHandler((query: string) => {
      // Behave exactly like submitting from the input
      handleAsk(query);
    });
    return () => setAskHandler(null);
  }, [handleAsk, setAskHandler]);

  const toggleDeepResearch = useCallback(() => {
    if (isThinking) return;

    handleActivity();

    const newState = !isDeepResearchActive;
    setIsDeepResearchActive(newState);
  }, [handleActivity, isDeepResearchActive, isThinking]);

  const handleRecordingStart = useCallback(async () => {
    const t0 = performance.now();
    console.log("[ptt] press at", t0.toFixed(1));
    if (isRecording || isRealtimeConnecting) return;

    handleActivity();

    // First ensure mic is primed; if this is the first time (permission prompt), do not start recording yet.
    try {
      const prime = await primeMicrophone();
      const showMicToast = (text: string, duration: number) => {
        setMicToastText(text);
        setMicToastVisible(true);
        if (micToastTimerRef.current) clearTimeout(micToastTimerRef.current);
        micToastTimerRef.current = setTimeout(() => setMicToastVisible(false), duration);
      };

      if (prime === "failed") {
        // Show toast and bail
        showMicToast(t("mic_permission_blocked", "Microphone access blocked. Allow mic and try again."), 2400);
        return;
      }
      if (prime === "just_primed") {
        // Permission was just granted; ask user to press again to avoid UI glitches
        showMicToast(t("mic_ready_try_again", "Mic permissions ready. Press and hold again!"), 1800);
        return;
      }
      // already_primed => proceed to real start
    } catch (e) {
      console.warn("[ptt] primeMicrophone threw", e);
      return;
    }

    // Immediately show connecting UI only when actually starting
    setIsRealtimeConnecting(true);
    setIsMicrophoneReady(false); // Reset mic ready state for new recording
    setValue("");
    if (isSearchModalOpen) setSearchQuery("");

    console.log("[ptt] calling startRecording() (will prime+connect in parallel)");
    startRecording()
      .then(() => {
        console.log("[ptt] startRecording finished in", (performance.now() - t0).toFixed(1), "ms");
      })
      .catch((error) => {
        console.error("[ptt] Error starting recording:", error);
        setIsRealtimeConnecting(false);
      });
  }, [handleActivity, isRecording, isRealtimeConnecting, isSearchModalOpen, setSearchQuery, startRecording, setValue, primeMicrophone, t]);

  // Clear connecting state when both session and microphone are ready
  useEffect(() => {
    if (isSessionReady && isMicrophoneReady && isRealtimeConnecting) {
      setIsRealtimeConnecting(false);
      console.log("[ptt] session+mic ready; clearing connecting state at", performance.now().toFixed(1));
    }
  }, [isSessionReady, isMicrophoneReady, isRealtimeConnecting]);

  const handleRecordingEnd = useCallback(() => {
    if (!isRecording) return;

    handleActivity();

    setTimeout(() => {
      stopRecording().catch((error) => console.error("Error stopping recording:", error));
    }, 150);
  }, [handleActivity, isRecording, stopRecording]);

  const placeholder = useMemo(() => {
    if (isRealtimeConnecting) return ""; // hide placeholder while connecting to avoid visual overlap
    if (isRecording) return t("listening");
    if (isThinking) return t("thinking");
    if (isDeepResearchActive) return t("enter_deep_research");
    return t("search_or_ask");
  }, [isRealtimeConnecting, isRecording, isThinking, isDeepResearchActive, t]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "f" || event.key === "F") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleActivity();
        shouldSelectAllRef.current = true;
        openModalWithFocus();
      }
    };

    const handleDocumentPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;

      if (containerRef.current?.contains(target)) return;
      if (target.closest('[role="dialog"]') || target.closest('[role="tooltip"]')) return;

      setIsTimersPausedSticky(false);
      startAllTimers();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    };
  }, [handleActivity, openModalWithFocus, startAllTimers, setIsTimersPausedSticky]);

  useEffect(() => {
    setHighlightedMention(0);
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
    <>
      <AnimatePresence>
        {micToastVisible && (
          <motion.div
            className="fixed bottom-44 right-4 z-50 bg-black/85 border border-white/30 text-white rounded-full px-3 py-2 shadow-xl text-xs"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            {micToastText}
          </motion.div>
        )}
      </AnimatePresence>
      {showMicDebug && <DebugMicPlaybackButton />}
      <MicrophoneVisualizer isActive={isRecording || isRealtimeConnecting} audioAnalyser={audioAnalyser} onMicReady={setIsMicrophoneReady} />
      <OptionalElement className={cn("w-full flex justify-center", className)} id="bottom-input-container">
        <motion.div
          className={cn(
            "bg-black/70 textured-bg border shadow-xl text-white border-white/30 w-full rounded-3xl px-2 py-[2px] md:py-[3px] md:px-3",
            isRecording && "recording-active",
            isRealtimeConnecting && "border-amber-300/70 shadow-[0_0_12px_rgba(250,204,21,0.25)]",
          )}
          animate={isRecording ? "recordingContainer" : isRealtimeConnecting ? "connectingContainer" : "idle"}
          initial="idle"
          variants={variants.container}
          ref={containerRef}
          data-keep-modal-open="true"
        >
          <motion.div key="expanded" variants={variants.expandedContainer} initial="initial" animate="animate" exit="exit">
            <form onSubmit={handleSubmit} className="flex items-center space-x-2 min-w-[280px] sm:min-w-[350px]">
              <div className="relative flex-grow flex items-center">
                <AnimatePresence mode="wait">
                  {isRecording && (
                    <motion.div
                      key="recording-indicator"
                      className={cn("absolute left-2 w-3 h-3 rounded-full", "bg-red-500")}
                      variants={variants.recordingIndicator}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    />
                  )}
                </AnimatePresence>
                <AnimatePresence mode="wait">
                  {isRealtimeConnecting && (
                    <motion.div
                      key="connecting-label"
                      className="absolute left-6 flex items-center gap-1 text-[11px] uppercase tracking-[0.25em] text-amber-200/90 pointer-events-none"
                      variants={variants.connectingLabel}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    >
                      <Loader2 size={12} className="animate-spin" />
                      <span>{t("realtime_connecting", "Connecting")}</span>
                    </motion.div>
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
                      variants={variants.mentionList}
                      initial="initial"
                      animate="animate"
                      exit="exit"
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
                  className={cn(
                    "flex-grow bg-transparent text-white outline-none px-2 py-1",
                    isRecording ? "opacity-80 pl-7 font-medium" : "",
                    isRealtimeConnecting ? "opacity-60 pl-7 cursor-wait text-amber-100/80" : "",
                  )}
                  disabled={isRealtimeConnecting || isRecording || isThinking}
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
                        disabled={isThinking || isRecording || isRealtimeConnecting}
                        className={cn(
                          "rounded-full p-2 flex items-center justify-center",
                          isDeepResearchActive ? "text-orange-400" : "text-white/70",
                          isThinking ? "opacity-50 cursor-default" : "cursor-pointer",
                        )}
                        whileHover={!isThinking ? "hover" : undefined}
                        whileTap={!isThinking ? "tap" : undefined}
                        variants={variants.deepResearchButton}
                        initial="idle"
                        animate="idle"
                      >
                        <Telescope size={18} />
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
                          className={cn("p-2 rounded-full flex items-center justify-center cursor-pointer text-blue-400", isThinking ? "cursor-default" : "cursor-pointer")}
                          whileHover="hover"
                          whileTap="tap"
                          variants={variants.button}
                          initial="idle"
                          animate="idle"
                        >
                          {isThinking ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
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
                          className={cn(
                            "p-2 rounded-full flex items-center justify-center",
                            isRecording ? "text-red-400 cursor-pointer" : isRealtimeConnecting ? "text-amber-300 cursor-wait animate-pulse" : "text-white/70 cursor-pointer",
                          )}
                          style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
                          whileHover={!isRecording && !isRealtimeConnecting ? "hover" : undefined}
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
                      <TooltipContent>{isRecording ? t("stop_recording") : isRealtimeConnecting ? t("realtime_connecting", "Connecting…") : t("start_recording")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </form>
          </motion.div>
        </motion.div>
      </OptionalElement>
    </>
  );
};

export default BottomInput;

const variants: Record<string, Variants> = {
  button: {
    hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)", transition: { duration: 0.2 } },
    tap: { scale: 0.9, backgroundColor: "rgba(255,255,255,0.3)", transition: { type: "spring", stiffness: 400, damping: 10 } },
    tapMic: { scale: 1.2 },
    idle: { scale: 1, backgroundColor: "rgba(0,0,0,0)", boxShadow: "0px 0px 0px rgba(0,0,0,0)", transition: { duration: 0.2 } },
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
    idle: { scale: 1, backgroundColor: "rgba(0,0,0,0)", boxShadow: "0px 0px 0px rgba(0,0,0,0)", transition: { duration: 0.2 } },
  },
  container: {
    idle: { boxShadow: "0px 0px 0px rgba(239, 68, 68, 0)", borderColor: "rgba(255, 255, 255, 0.3)" },
    connectingContainer: {
      boxShadow: ["0px 0px 0px rgba(250, 204, 21, 0.2)", "0px 0px 12px rgba(250, 204, 21, 0.4)", "0px 0px 0px rgba(250, 204, 21, 0.2)"],
      borderColor: ["rgba(255, 255, 255, 0.3)", "rgba(250, 204, 21, 0.65)", "rgba(255, 255, 255, 0.3)"],
      transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
    },
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
  connectingIndicator: {
    initial: { opacity: 0, scale: 0.6 },
    animate: { opacity: [0.4, 0.9, 0.4], scale: [1, 1.1, 1], transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } },
    exit: { opacity: 0, scale: 0.6, transition: { duration: 0.2 } },
  },
  connectingLabel: { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0, transition: { duration: 0.2 } }, exit: { opacity: 0, y: -4, transition: { duration: 0.15 } } },
  mentionList: {
    initial: { opacity: 0, y: 6, transition: { duration: 0.2 } },
    animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
    exit: { opacity: 0, y: 6, transition: { duration: 0.2 } },
  },
};
