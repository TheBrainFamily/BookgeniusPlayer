import { useCallback, useEffect, useRef } from "react";

import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import { setupPageObserver } from "@player/ui/pageObserver";
import { findSimplifiedSentence } from "@player/helpers/findSimplifiedSentence";
import { replaceXmlTagsIntoHtmlTags } from "@player/helpers/replaceXmlTagsIntoHtmlTags";
import { activateCharacterInteractions } from "@player/helpers/activateCharacterInteractions";
import { useEditorMode } from "@player/hooks/useEditorMode";
import { useBookData } from "@player/context/BookDataContext";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { goToParagraph } from "@player/helpers/paragraphsNavigation";
import { useLocation } from "@player/state/LocationContext";
import { disposeVirtualizer, ensureChapterWindow, initializeBookContentVirtualizer } from "@player/logic/BookContentVirtualizer";
import { bookIndex } from "@player/logic/BookIndex";

const findSimplifiedSentenceRef = { current: findSimplifiedSentence };

if (import.meta.hot) {
  import.meta.hot.accept("@player/helpers/findSimplifiedSentence", (mod) => {
    findSimplifiedSentenceRef.current = mod.findSimplifiedSentence;
    console.info("[HMR] findSimplifiedSentence updated");
  });
}

const isEditorMode = import.meta.env.VITE_EDITOR === "true";
const containerId = "content-container";

export function useBookContent() {
  const { textVersion } = useBookData();
  const { location } = useLocation();
  const { currentChapter, currentParagraph } = location;
  const {
    metadata: { bookForm },
  } = getBookData();
  const { openModal: openCharacterDetailsModal } = useCharacterModal();

  const previousTextVersionRef = useRef(textVersion);
  const lastInitializedVersionRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const observerSetupRef = useRef<{
    observer: IntersectionObserver;
    observeNewParagraphs: () => number;
    cleanupRemovedParagraphs: () => number;
    observeNewSpacers: () => number;
    cleanupRemovedSpacers: () => number;
    cleanup: () => void;
  } | null>(null);
  const currentChapterRef = useRef<number | undefined>(currentChapter);

  useEditorMode(isEditorMode ? containerRef.current : null);

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      if (event.metaKey || event.ctrlKey) return;

      const target = event.target as HTMLElement;

      if (target.closest(".character-highlighted-activated") || target.closest(".character-placeholder")) {
        return;
      }

      const span = target.closest("span[id^='ch']") as HTMLElement;
      if (!span) return;

      event.preventDefault();
      event.stopPropagation();

      if (isCharacterPlaceholder(span, bookForm)) return;

      const currentSentenceId = span.id;
      const isFirstSimplification = !span.hasAttribute("data-simplified");

      // Store original sentence only on first tap
      if (isFirstSimplification) {
        span.setAttribute("data-original-sentence", span.innerHTML);
      }

      const currentSentenceScore = span.getAttribute("data-current-score") || "100";
      const { text: simplifiedSentence, score: simplifiedSentenceScore } = findSimplifiedSentenceRef.current(currentSentenceId, parseInt(currentSentenceScore));

      // Handle case when no further simplification is available
      if (!simplifiedSentence) {
        console.warn(`No further simplification available for ${currentSentenceId}`);

        // Reset to original sentence
        const originalSentence = span.getAttribute("data-original-sentence") || "";
        span.innerHTML = replaceXmlTagsIntoHtmlTags(originalSentence);
        span.removeAttribute("data-current-score");
        span.setAttribute("data-simplified", "false");

        // Clean up old event listeners
        span.querySelectorAll('[data-click-listener-attached="true"]').forEach((el) => {
          el.removeAttribute("data-click-listener-attached");
        });

        activateCharacterInteractions(span);
        return;
      }

      // Update content
      span.innerHTML = replaceXmlTagsIntoHtmlTags(simplifiedSentence);
      span.setAttribute("data-current-score", simplifiedSentenceScore.toString());
      span.setAttribute("data-simplified", "true");

      wrapSimplifiedSentenceTail(span);

      // Activate character interactions
      activateCharacterInteractions(span);
      setSentenceAsClicked(currentSentenceId);
    },
    [bookForm],
  );

  useEffect(() => {
    containerRef.current = document.getElementById(containerId);
  }, []);

  useEffect(() => {
    const bookContainer = document.getElementById("book-container");
    if (bookContainer) {
      if (bookForm === "play" || bookForm === "mixed") {
        bookContainer.classList.add("play-mode");
      } else {
        bookContainer.classList.remove("play-mode");
      }
    }
  }, [bookForm]);

  useEffect(() => {
    currentChapterRef.current = currentChapter;
  }, [currentChapter]);

  const handleContentChanged = useCallback(() => {
    if (observerSetupRef.current) {
      // Refresh observed nodes for the existing observer
      observerSetupRef.current.observeNewParagraphs();
      observerSetupRef.current.cleanupRemovedParagraphs();
      observerSetupRef.current.observeNewSpacers();
      observerSetupRef.current.cleanupRemovedSpacers();
    } else {
      observerSetupRef.current = setupPageObserver(openCharacterDetailsModal);
    }
  }, [openCharacterDetailsModal]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      console.warn(`Container with id ${containerId} not found for content virtualization.`);
      return () => {};
    }

    if (lastInitializedVersionRef.current !== textVersion) {
      bookIndex.invalidate();
      lastInitializedVersionRef.current = textVersion;
    }

    let cancelled = false;

    const initializeVirtualizer = async () => {
      try {
        await initializeBookContentVirtualizer({ container, onContentChanged: handleContentChanged });
        const initialChapter = typeof currentChapterRef.current === "number" ? currentChapterRef.current : (bookIndex.getFirstChapter() ?? 1);
        await ensureChapterWindow(initialChapter, { force: true });
        if (!cancelled) {
          handleContentChanged();
        }
      } catch (error) {
        console.error("useBookContent: Failed to initialize chapter virtualizer", error);
      }
    };

    void initializeVirtualizer();

    return () => {
      cancelled = true;
      if (observerSetupRef.current) {
        observerSetupRef.current.cleanup();
        observerSetupRef.current = null;
      }
      disposeVirtualizer();
    };
  }, [textVersion, handleContentChanged]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    container.addEventListener("pointerup", handlePointerUp);

    return () => {
      container.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerUp]);

  useEffect(() => {
    if (typeof currentChapter !== "number") {
      return;
    }

    void (async () => {
      try {
        await ensureChapterWindow(currentChapter);
      } catch (error) {
        console.error("useBookContent: Failed to update chapter window", error);
      } finally {
        handleContentChanged();
      }
    })();
  }, [currentChapter, handleContentChanged]);

  useEffect(() => {
    const textVersionChanged = previousTextVersionRef.current !== textVersion;
    previousTextVersionRef.current = textVersion;

    if (!textVersionChanged) {
      return;
    }

    if (typeof currentChapter !== "number" || typeof currentParagraph !== "number") {
      return;
    }

    if (observerSetupRef.current) {
      observerSetupRef.current.cleanup();
      observerSetupRef.current = null;
    }

    void (async () => {
      try {
        await ensureChapterWindow(currentChapter, { force: true });
        requestAnimationFrame(() => {
          void goToParagraph({ currentChapter, currentParagraph }, { behavior: "instant" }).catch((error) => {
            console.error("useBookContent: Failed to restore scroll position after reload", error);
          });
        });
      } catch (error) {
        console.error("useBookContent: Failed to remount chapters after reload", error);
      } finally {
        handleContentChanged();
      }
    })();
  }, [currentChapter, currentParagraph, textVersion, handleContentChanged]);
}

// Ensure last word (incl. trailing punctuation) and icon stay on same line
function wrapSimplifiedSentenceTail(root: HTMLElement) {
  const prev = root.querySelector(":scope > .simplified-tail");
  if (prev) {
    while (prev.firstChild) prev.parentNode!.insertBefore(prev.firstChild, prev);
    prev.remove();
  }

  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      return n.textContent!.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  let lastText: Text | null = null;
  for (let n = tw.nextNode(); n; n = tw.nextNode()) lastText = n as Text;
  if (!lastText) return;

  lastText.data = lastText.data.replace(/[\s\u00a0]+$/u, "");
  const m = /(\S+[.,!?;:'")\]]*)$/.exec(lastText.data);
  if (!m) return;

  const start = lastText.data.length - m[1].length;
  const tailNode = start > 0 ? lastText.splitText(start) : lastText;
  const wrap = document.createElement("span");
  wrap.className = "simplified-tail";
  tailNode.parentNode!.insertBefore(wrap, tailNode);
  wrap.appendChild(tailNode);

  const next = wrap.nextSibling;
  if (next?.nodeType === Node.TEXT_NODE && /^[.,!?;:'")\]]+/.test((next as Text).data)) {
    wrap.appendChild(next);
  }
}

const setSentenceAsClicked = (sentenceId: string): void => {
  try {
    const clickedSentencesRaw = localStorage.getItem("clickedSentences");
    let clickedSentences: string[] = [];

    if (clickedSentencesRaw) {
      const parsed = JSON.parse(clickedSentencesRaw);
      if (Array.isArray(parsed)) {
        clickedSentences = parsed;
      }
    }

    if (!clickedSentences.includes(sentenceId)) {
      clickedSentences.push(sentenceId);
      localStorage.setItem("clickedSentences", JSON.stringify(clickedSentences));
    }
  } catch (error) {
    console.error("Failed to update clicked sentences in localStorage:", error);
  }
};

// TODO this shouldnt rely on things like strong, lets do this right
const isCharacterPlaceholder = (span: HTMLElement, bookForm: string): boolean => {
  console.log("bookForm", bookForm);
  if (bookForm === "play" || bookForm === "mixed") {
    return span.children.length === 1 && span.children[0].tagName === "STRONG";
  }
  return span.children.length === 2 && span.children[0].classList.contains("character-placeholder") && span.children[1].tagName === "STRONG";
};
