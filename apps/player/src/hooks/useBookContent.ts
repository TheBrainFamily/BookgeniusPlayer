import { useEffect, useRef } from "react";
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

export function useBookContent(containerId: string) {
  const container = document.getElementById(containerId);
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

  useEffect(() => {
    if (container) {
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

      // Give the browser a moment to render the injected HTML
      const handlePointerUp = (event: PointerEvent) => {
        if (event.metaKey || event.ctrlKey) {
          return;
        }
        const target = event.target as HTMLElement;

        if (target.closest(".character-highlighted-activated")) {
          return;
        }

        // If the icon was clicked, let its own handler deal with it and don't simplify further.
        if (target.closest(".simplified-icon")) {
          return;
        }

        const span = target.closest("span[id^='ch']");

        if (span) {
          event.preventDefault();
          event.stopPropagation();
          let isCharacterPlaceholder = false;
          if (bookForm === "play") {
            isCharacterPlaceholder = span.children.length === 1 && span.children[0].tagName === "STRONG";
          } else {
            isCharacterPlaceholder = span.children.length === 2 && span.children[0].classList.contains("character-placeholder") && span.children[1].tagName === "STRONG";
          }

          if (isCharacterPlaceholder) return;

          const isFirstSimplification = !span.hasAttribute("data-simplified");

          // Store the original sentence only on the first tap.
          if (isFirstSimplification) {
            span.setAttribute("data-original-sentence", span.innerHTML);
          }

          const currentSentenceId = span.id;
          const currentSentenceScore = span.getAttribute("data-current-score") || "100";
          const { text: simplifiedSentence, score: simplifiedSentenceScore } = findSimplifiedSentenceRef.current(span.id, parseInt(currentSentenceScore));

          if (!simplifiedSentence) {
            console.warn(`No further simplification available for ${currentSentenceId}`);
            // We can add a visual cue here later if needed.

            span.innerHTML = replaceXmlTagsIntoHtmlTags(span.getAttribute("data-original-sentence") || "");
            span.removeAttribute("data-current-score");
            span.setAttribute("data-simplified", "false");
            span.querySelectorAll('[data-click-listener-attached="true"]').forEach((el) => {
              el.removeAttribute("data-click-listener-attached");
            });

            activateCharacterInteractions(span as HTMLElement, openCharacterDetailsModal);

            return;
          }

          // Remove old icon if it exists before updating innerHTML
          const existingIcon = span.querySelector(".simplified-icon");
          if (existingIcon) {
            span.removeChild(existingIcon);
          }

          span.innerHTML = replaceXmlTagsIntoHtmlTags(simplifiedSentence);
          span.setAttribute("data-current-score", simplifiedSentenceScore.toString());
          span.setAttribute("data-simplified", "true");

          activateCharacterInteractions(span as HTMLElement, openCharacterDetailsModal);

          const iconContainer = document.createElement("span");
          iconContainer.className = "simplified-icon";
          iconContainer.style.marginLeft = "5px";
          iconContainer.style.cursor = "pointer";
          iconContainer.style.display = "inline-block";
          iconContainer.style.verticalAlign = "middle";
          iconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--book-simplified-icon-color, ForestGreen)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`;
          span.appendChild(iconContainer);

          // 5. Activate character interactions for newly transformed content
          activateCharacterInteractions(target, openCharacterDetailsModal);
          setSentenceAsClicked(currentSentenceId);
        }
      };

      const handleMouseOver = (event: MouseEvent) => {
        const span = (event.target as HTMLElement).closest("span");

        if (span && /^ch\d+-p\d+-s\d+$/.test(span.id)) {
          span.style.backgroundColor = "rgba(66, 68, 90, 0.1)";
          span.style.padding = "0.2rem 0";
          span.style.cursor = "pointer";
          span.style.touchAction = "none";
        }
      };

      const handleMouseOut = (event: MouseEvent) => {
        const span = (event.target as HTMLElement).closest("span");
        if (span && /^ch\d+-p\d+-s\d+$/.test(span.id)) {
          span.style.backgroundColor = "transparent";
          span.style.padding = "0";
          span.style.cursor = "default";
        }
      };

      container.addEventListener("pointerup", handlePointerUp);
      container.addEventListener("mouseover", handleMouseOver);
      container.addEventListener("mouseout", handleMouseOut);

      return () => {
        container.removeEventListener("pointerup", handlePointerUp);
        container.removeEventListener("mouseover", handleMouseOver);
        container.removeEventListener("mouseout", handleMouseOut);
        // Clean up the observer and its event listeners
        if (observerSetup) {
          observerSetup.cleanup();
        }
      };
    } else {
      console.warn(`Container with id '${containerId}' not found for content injection.`);
    }
  }, [bookStringified, containerId, textVersion]); // Rerun if content, ID, or text version changes

  useEffect(() => {
    const textVersionChanged = previousTextVersionRef.current !== textVersion;
    previousTextVersionRef.current = textVersion;

    if (!textVersionChanged) {
      return;
    }

    if (typeof currentChapter !== "number" || typeof currentParagraph !== "number") {
      return;
    }

    const containerElement = document.getElementById(containerId);
    if (!containerElement) {
      return;
    }

    // Re-align the scroll position with the current location after the book
    // content has been reloaded (e.g. via the editor "Reload Book Data" button).
    requestAnimationFrame(() => {
      void goToParagraph({ currentChapter, currentParagraph }, { behavior: "instant" }).catch((error) => {
        console.error("useBookContent: Failed to restore scroll position after reload", error);
      });
    });
  }, [containerId, currentChapter, currentParagraph, textVersion]);
}

function setSentenceAsClicked(sentenceId: string) {
  const clickedSentencesRaw = localStorage.getItem("clickedSentences");
  let clickedSentences: string[] = [];

  if (clickedSentencesRaw) {
    try {
      const parsed = JSON.parse(clickedSentencesRaw);
      if (Array.isArray(parsed)) {
        clickedSentences = parsed;
      }
    } catch (e) {
      console.error("Failed to parse clickedSentences from localStorage. Starting fresh.", e);
      clickedSentences = [];
    }
  }

  if (!clickedSentences.includes(sentenceId)) {
    clickedSentences.push(sentenceId);
    localStorage.setItem("clickedSentences", JSON.stringify(clickedSentences));
  }
}
