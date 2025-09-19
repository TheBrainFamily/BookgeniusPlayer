import { useCallback, useEffect, useRef } from "react";

import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import { setupPageObserver } from "@player/ui/pageObserver";
import { getBookStringified } from "@player/genericBookDataGetters/getBookStringified";
import { findSimplifiedSentence } from "@player/helpers/findSimplifiedSentence";
import { replaceXmlTagsIntoHtmlTags } from "@player/helpers/replaceXmlTagsIntoHtmlTags";
import { activateCharacterInteractions } from "@player/helpers/activateCharacterInteractions";
import { useEditorMode } from "@player/hooks/useEditorMode";
import { useBookData } from "@player/context/BookDataContext";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { goToParagraph } from "@player/helpers/paragraphsNavigation";
import { useLocation } from "@player/state/LocationContext";
import { addPaddingBottomLastChapter } from "@player/helpers/addPaddingBottomLastChapter";
import { addSpaceBetweenChapters } from "@player/helpers/addSpaceBetweenChapters";
import { backgroundsForBook } from "@player/ui/backgroundsForBook";

const findSimplifiedSentenceRef = { current: findSimplifiedSentence };

if (import.meta.hot) {
  import.meta.hot.accept("@player/helpers/findSimplifiedSentence", (mod) => {
    findSimplifiedSentenceRef.current = mod.findSimplifiedSentence;
    console.info("[HMR] findSimplifiedSentence updated");
  });
}

const isEditorMode = import.meta.env.VITE_EDITOR === "true";

const container = document.getElementById("content-container");

export function useBookContent() {
  const { textVersion } = useBookData();
  const { location } = useLocation();
  const { currentChapter, currentParagraph } = location;
  const previousTextVersionRef = useRef(textVersion);
  const bookStringified = getBookStringified();
  const {
    metadata: { bookForm },
  } = getBookData();

  const { openModal: openCharacterDetailsModal } = useCharacterModal();

  useEditorMode(isEditorMode ? container : null);

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      if (event.metaKey || event.ctrlKey) return;

      const target = event.target as HTMLElement;

      if (target.closest(".character-highlighted-activated") || target.closest(".simplified-icon")) {
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

        activateCharacterInteractions(span, openCharacterDetailsModal);
        return;
      }

      // Remove existing icon before updating content
      const existingIcon = span.querySelector(".simplified-icon");
      existingIcon?.remove();

      // Update content
      span.innerHTML = replaceXmlTagsIntoHtmlTags(simplifiedSentence);
      span.setAttribute("data-current-score", simplifiedSentenceScore.toString());
      span.setAttribute("data-simplified", "true");

      // Add new simplified icon
      const iconContainer = createSimplifiedIcon();
      span.appendChild(iconContainer);

      // Activate character interactions
      activateCharacterInteractions(span, openCharacterDetailsModal);
      setSentenceAsClicked(currentSentenceId);
    },
    [bookForm, openCharacterDetailsModal],
  );

  useEffect(() => {
    if (!container) {
      console.warn(`Container with id "content-container" not found for content injection.`);
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(bookStringified, "text/html");
    const chapterSections = Array.from(doc.querySelectorAll("section[data-chapter]"));

    if (chapterSections.length > 0) {
      if (backgroundsForBook.length > 0) {
        addSpaceBetweenChapters(doc, chapterSections);
      }
      addPaddingBottomLastChapter(doc, chapterSections);
    }

    container.innerHTML = doc.body.innerHTML;
    const observerSetup = setupPageObserver(openCharacterDetailsModal);

    container.addEventListener("pointerup", handlePointerUp);

    return () => {
      container.removeEventListener("pointerup", handlePointerUp);

      if (observerSetup) {
        observerSetup.cleanup();
      }
    };
  }, [bookStringified, textVersion, handlePointerUp, openCharacterDetailsModal]);

  useEffect(() => {
    const textVersionChanged = previousTextVersionRef.current !== textVersion;
    previousTextVersionRef.current = textVersion;

    if (!textVersionChanged) {
      return;
    }

    if (typeof currentChapter !== "number" || typeof currentParagraph !== "number") {
      return;
    }

    // Re-align the scroll position with the current location after the book
    // content has been reloaded (e.g. via the editor "Reload Book Data" button).
    requestAnimationFrame(() => {
      void goToParagraph({ currentChapter, currentParagraph }, { behavior: "instant" }).catch((error) => {
        console.error("useBookContent: Failed to restore scroll position after reload", error);
      });
    });
  }, [currentChapter, currentParagraph, textVersion]);
}

const createSimplifiedIcon = (): HTMLSpanElement => {
  const iconContainer = document.createElement("span");
  iconContainer.className = "simplified-icon";
  iconContainer.style.marginLeft = "5px";
  iconContainer.style.cursor = "pointer";
  iconContainer.style.display = "inline-block";
  iconContainer.style.verticalAlign = "middle";
  iconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--book-simplified-icon-color, ForestGreen)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`;
  return iconContainer;
};

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

const isCharacterPlaceholder = (span: HTMLElement, bookForm: string): boolean => {
  if (bookForm === "play") {
    return span.children.length === 1 && span.children[0].tagName === "STRONG";
  }
  return span.children.length === 2 && span.children[0].classList.contains("character-placeholder") && span.children[1].tagName === "STRONG";
};
