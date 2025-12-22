import { useCallback, useEffect, useRef } from "react";

import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import { setupPageObserver } from "@player/ui/pageObserver";
import { findSimplifiedSentence } from "@player/helpers/findSimplifiedSentence";
import { replaceXmlTagsIntoHtmlTags } from "@player/helpers/replaceXmlTagsIntoHtmlTags";
import { activateCharacterInteractions } from "@player/helpers/activateCharacterInteractions";
import { activateFootnoteInteractions } from "@player/helpers/activateFootnoteInteractions";
import { useEditorMode } from "@player/hooks/useEditorMode";
import { useBookConvex } from "@player/context/BookConvexContext";
import { goToParagraph } from "@player/helpers/paragraphsNavigation";
import { markLayoutUnstable, LAYOUT_UNSTABLE_VIRTUALIZER_MS } from "@player/helpers/locationCommitter";
import { useLocation } from "@player/state/LocationContext";
import { disposeVirtualizer, ensureChapterWindow, initializeBookContentVirtualizer, updateMountedChaptersInPlace } from "@player/logic/BookContentVirtualizer";
import { bookIndex } from "@player/logic/BookIndex";
import { openPlayRowCharacterModal } from "@player/ui/activateMediaInRange";
import { scrollCoordinator } from "@player/services/ScrollCoordinator";

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
  const { textVersion, bookData, isReady, bookStringified } = useBookConvex();
  const { location } = useLocation();
  const { currentChapter, currentParagraph } = location;
  const bookForm = bookData?.metadata?.bookForm || "prose";
  const { openModal: openCharacterDetailsModal } = useCharacterModal();

  // Initialize to -1 so the first real version (0 or 1) is always detected as a change
  // Using textVersion as initial value would miss the first update if component mounts after version change
  const previousTextVersionRef = useRef(-1);
  const containerRef = useRef<HTMLElement | null>(null);
  const virtualizerInitializedRef = useRef(false);
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

  const isPlayFormat = bookForm === "play" || bookForm === "mixed";

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      if (event.metaKey || event.ctrlKey) return;

      const target = event.target as HTMLElement;

      const isInlineAvatar = target.closest(".inline-avatar");
      const isCharacterHighlighted = target.classList.contains("character-highlighted-activated");
      const isCharacterPlaceholder = target.closest(".character-placeholder");
      const isCharacterText = target.closest(`[data-is-character="true"]`);

      const complexitySpan = target.closest("span[id^='ch']") as HTMLElement;

      if (!complexitySpan && !isCharacterText && !isInlineAvatar && !isCharacterHighlighted && !isCharacterPlaceholder) return;

      event.preventDefault();
      event.stopPropagation();

      if (isCharacterText || isInlineAvatar || isCharacterHighlighted || isCharacterPlaceholder) {
        openPlayRowCharacterModal(target, openCharacterDetailsModal);
        return;
      }

      const currentSentenceId = complexitySpan.id;
      const isFirstSimplification = !complexitySpan.hasAttribute("data-simplified");

      // Store original sentence only on first tap
      if (isFirstSimplification) {
        complexitySpan.setAttribute("data-original-sentence", complexitySpan.innerHTML);
      }

      const currentSentenceScore = complexitySpan.getAttribute("data-current-score") || "100";
      const { text: simplifiedSentence, score: simplifiedSentenceScore } = findSimplifiedSentenceRef.current(currentSentenceId, parseInt(currentSentenceScore));

      const sentenceNumber = parseInt(complexitySpan.getAttribute("id")?.split("-s")?.[1] ?? "1", 10);
      const isFirstSentence = sentenceNumber === 1;

      // Handle case when no further simplification is available
      if (!simplifiedSentence) {
        console.warn(`No further simplification available for ${currentSentenceId}`);

        // Reset to original sentence
        const originalSentence = complexitySpan.getAttribute("data-original-sentence") || "";
        complexitySpan.innerHTML = replaceXmlTagsIntoHtmlTags(originalSentence, isPlayFormat, isFirstSentence);
        complexitySpan.removeAttribute("data-current-score");
        complexitySpan.setAttribute("data-simplified", "false");

        // Clean up old event listeners
        complexitySpan.querySelectorAll('[data-click-listener-attached="true"]').forEach((el) => {
          el.removeAttribute("data-click-listener-attached");
        });

        activateCharacterInteractions(complexitySpan);
        activateFootnoteInteractions(complexitySpan);
        return;
      }

      // Update content
      complexitySpan.innerHTML = replaceXmlTagsIntoHtmlTags(simplifiedSentence, isPlayFormat, isFirstSentence);
      complexitySpan.setAttribute("data-current-score", simplifiedSentenceScore.toString());
      complexitySpan.setAttribute("data-simplified", "true");

      wrapSimplifiedSentenceTail(complexitySpan);

      // Activate character interactions
      activateCharacterInteractions(complexitySpan);
      activateFootnoteInteractions(complexitySpan);
      setSentenceAsClicked(currentSentenceId);
    },
    [openCharacterDetailsModal, isPlayFormat],
  );

  useEffect(() => {
    containerRef.current = document.getElementById(containerId);
  }, []);

  // Initialize ScrollCoordinator when container is available
  useEffect(() => {
    const container = document.getElementById(containerId);
    if (container) {
      scrollCoordinator.initialize(container);
    }

    return () => {
      scrollCoordinator.destroy();
    };
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
    // Mark layout unstable during virtualizer content changes
    // Prevents transient observer states from being committed as "furthest"
    markLayoutUnstable("virtualizer", LAYOUT_UNSTABLE_VIRTUALIZER_MS);

    if (observerSetupRef.current) {
      // Refresh observed nodes for the existing observer
      observerSetupRef.current.observeNewParagraphs();
      observerSetupRef.current.cleanupRemovedParagraphs();
      observerSetupRef.current.observeNewSpacers();
      observerSetupRef.current.cleanupRemovedSpacers();
    } else {
      observerSetupRef.current = setupPageObserver();
    }
  }, []);

  // Initialize virtualizer ONCE when container AND bookStringified are available
  // This must NOT re-run when bookStringified changes - only when initially ready
  // Content updates are handled by the separate textVersion effect below using updateMountedChaptersInPlace
  useEffect(() => {
    // Skip if already initialized - prevents re-init on content changes
    if (virtualizerInitializedRef.current) {
      return () => {};
    }

    // Wait until we have book content - prevents initialization before store is ready
    if (!isReady || !bookStringified) {
      return () => {};
    }

    const container = containerRef.current;

    if (!container) {
      console.warn(`Container with id ${containerId} not found for content virtualization.`);
      return () => {};
    }

    let cancelled = false;

    const initializeVirtualizer = async () => {
      try {
        await initializeBookContentVirtualizer({ container, onContentChanged: handleContentChanged });
        const initialChapter = typeof currentChapterRef.current === "number" ? currentChapterRef.current : (bookIndex.getFirstChapter() ?? 1);
        await ensureChapterWindow(initialChapter, { force: true });
        if (!cancelled) {
          virtualizerInitializedRef.current = true;
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
      virtualizerInitializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bookStringified intentionally excluded
    // We only want to initialize ONCE when first ready. Content updates are handled
    // by the textVersion effect using updateMountedChaptersInPlace().
    // Including bookStringified would cause cleanup to run (disposing virtualizer)
    // before the next effect run, triggering full re-initialization and scroll loss.
  }, [handleContentChanged, isReady]);

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
    // Wait until we have book content
    if (!isReady || !bookStringified) {
      return;
    }

    if (typeof currentChapter !== "number") {
      return;
    }

    // During explicit system navigation (search / Go Back), chapter
    // windows are managed by the navigation helper itself.
    if (scrollCoordinator.isNavigating) {
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
  }, [currentChapter, handleContentChanged, isReady, bookStringified]);

  useEffect(() => {
    const prevVersion = previousTextVersionRef.current;
    const textVersionChanged = prevVersion !== textVersion;

    console.log("[Convex:Flow] useBookContent textVersion effect", { textVersionChanged, prevVersion, newVersion: textVersion });

    // Only update ref AFTER we've checked for change (fixes React strict mode double-invoke)
    if (!textVersionChanged) {
      console.log("[Convex:Flow] No version change, skipping update");
      return;
    }

    // Need bookStringified to update content
    if (!bookStringified) {
      console.log("[Convex:Flow] No bookStringified available, skipping update");
      return;
    }

    // Update ref now that we know there's a real change
    previousTextVersionRef.current = textVersion;

    // Skip the initial mount (ref starts at -1, first real version is 1)
    // Initial load is handled by the virtualizer initialization effect
    if (prevVersion === -1) {
      console.log("[Convex:Flow] Initial mount, skipping in-place update");
      return;
    }

    console.log("[Convex:Flow] Version changed! Doing in-place content update");

    // Initialize bookIndex with the FRESH bookStringified from context (not stale store)
    // This avoids the race condition where the store hasn't been updated yet
    bookIndex.initializeWith(bookStringified);

    // Update mounted chapters in-place (no remount, preserves scroll)
    updateMountedChaptersInPlace();

    // Refresh observers for the new content
    handleContentChanged();

    console.log("[Convex:Flow] In-place update complete, scroll preserved");
  }, [textVersion, bookStringified, handleContentChanged]);
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
