import { activateCharacters } from "./characterHelpers";
import { getGlobalEditModeActive } from "@player/context/EditModeContext";

let isScrolling = false;
let scrollDebounce: NodeJS.Timeout;
let currentEditHoverElement: HTMLElement | null = null;
let currentHoveredParagraph: HTMLElement | null = null;

export type OpenTalkingCharacterModalFn = (
  chapterNumber: number,
  paragraphIndex: number,
  currentSpeaker: string | null,
) => void;
let openTalkingCharacterModalFn: OpenTalkingCharacterModalFn | null = null;

export function setOpenTalkingCharacterModal(fn: OpenTalkingCharacterModalFn): void {
  openTalkingCharacterModalFn = fn;
}

export type OpenEditCharacterTagModalFn = (
  chapterNumber: number,
  paragraphIndex: number,
  characterSlug: string,
  textContent: string,
) => void;
let openEditCharacterTagModalFn: OpenEditCharacterTagModalFn | null = null;

export function setOpenEditCharacterTagModal(fn: OpenEditCharacterTagModalFn): void {
  openEditCharacterTagModalFn = fn;
}

export type OpenWrapWithCharacterModalFn = (
  chapterNumber: number,
  paragraphIndex: number,
  selectedText: string,
  occurrenceIndex: number,
) => void;
let openWrapWithCharacterModalFn: OpenWrapWithCharacterModalFn | null = null;

export function setOpenWrapWithCharacterModal(fn: OpenWrapWithCharacterModalFn): void {
  openWrapWithCharacterModalFn = fn;
}

function getSelectionInfo(): {
  chapterNumber: number;
  paragraphIndex: number;
  selectedText: string;
  occurrenceIndex: number;
} | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return null;
  }

  const selectedText = selection.toString().trim();
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;

  const element =
    container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as HTMLElement);
  if (!element) return null;

  const paragraph = element.closest<HTMLElement>("section[data-chapter] [data-index]");
  const section = paragraph?.closest<HTMLElement>("section[data-chapter]");

  if (!paragraph || !section) return null;

  const chapterNumber = parseInt(section.dataset.chapter || "0");
  const paragraphIndex = parseInt(paragraph.dataset.index || "0");

  // Calculate which occurrence of the selected text this is
  const paragraphText = paragraph.textContent || "";
  let occurrenceIndex = 0;

  // Get the text offset of the selection start within the paragraph
  const preSelectionRange = document.createRange();
  preSelectionRange.selectNodeContents(paragraph);
  preSelectionRange.setEnd(range.startContainer, range.startOffset);
  const selectionStartOffset = preSelectionRange.toString().length;

  // Count how many times the selected text appears before this position
  let searchPos = 0;
  while (searchPos < selectionStartOffset) {
    const foundPos = paragraphText.indexOf(selectedText, searchPos);
    if (foundPos === -1 || foundPos >= selectionStartOffset) break;
    occurrenceIndex++;
    searchPos = foundPos + 1;
  }

  return { chapterNumber, paragraphIndex, selectedText, occurrenceIndex };
}

function clearEditHover(): void {
  if (currentEditHoverElement) {
    currentEditHoverElement.classList.remove("edit-hover");
    currentEditHoverElement = null;
  }
}

function extractCurrentSpeaker(paragraph: HTMLElement): string | null {
  const talkingSpan = paragraph.querySelector<HTMLElement>('[data-is-talking="true"]');
  return talkingSpan?.dataset.character || null;
}

export function setupParagraphHighlighting() {
  const contentContainer = document.getElementById("content-container");
  if (!contentContainer) return;

  contentContainer.addEventListener("mouseover", (event) => {
    if (isScrolling) return;
    const target = event.target as HTMLElement;
    const paragraph = target.closest<HTMLElement>("section[data-chapter] [data-index]");
    if (paragraph) {
      currentHoveredParagraph = paragraph;

      const section = paragraph.closest<HTMLElement>("section[data-chapter]");
      if (!section) return;

      const chapterNumber = section.dataset.chapter;
      const paragraphNumber = paragraph.dataset.index;

      if (chapterNumber && paragraphNumber) {
        const chapterNum = parseInt(chapterNumber);
        const paragraphNum = parseInt(paragraphNumber);
        activateCharacters(chapterNum, paragraphNum);
      }

      if (getGlobalEditModeActive() && paragraph !== currentEditHoverElement) {
        clearEditHover();
        paragraph.classList.add("edit-hover");
        currentEditHoverElement = paragraph;
      }
    }
  });

  contentContainer.addEventListener("mouseout", (event) => {
    if (isScrolling) return;
    const target = event.target as HTMLElement;
    const paragraph = target.closest<HTMLElement>("section[data-chapter] p[data-index]");

    if (paragraph) {
      const entityNotes = document.querySelectorAll<HTMLElement>("#left-notes .entity-note");
      entityNotes.forEach((note) => {
        note.classList.remove("highlighted-entity", "highlighted-talking-entity");

        const imageElement = note.querySelector<HTMLImageElement>(".entity-image");
        if (imageElement && imageElement.dataset.originalSrc) {
          const currentSrcFilename = imageElement.src.split("/").pop();
          const originalSrcFilename = imageElement.dataset.originalSrc.split("/").pop();

          if (currentSrcFilename !== originalSrcFilename) {
            imageElement.src = imageElement.dataset.originalSrc;
          }
        }
      });
    }

    const relatedTarget = event.relatedTarget as HTMLElement | null;
    const stillInParagraph = relatedTarget?.closest<HTMLElement>(
      "section[data-chapter] [data-index]",
    );
    if (!stillInParagraph) {
      currentHoveredParagraph = null;
    }
    if (!stillInParagraph || stillInParagraph !== currentEditHoverElement) {
      clearEditHover();
    }
  });

  // eslint-disable-next-line complexity -- click handler with edit mode, character clicks, footnotes
  contentContainer.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    if (getGlobalEditModeActive()) {
      const selection = window.getSelection();
      const hasTextSelection =
        selection && !selection.isCollapsed && selection.toString().trim().length > 0;
      if (hasTextSelection) {
        return;
      }

      // Skip inline avatars - they should trigger set-talking-character, not edit-character-tag
      const isInlineAvatarClick = target.closest(".inline-avatar");
      if (!isInlineAvatarClick) {
        const characterSpan = target.closest<HTMLElement>(
          "[data-character]:not([data-is-talking])",
        );
        if (characterSpan && openEditCharacterTagModalFn) {
          const paragraph = characterSpan.closest<HTMLElement>(
            "section[data-chapter] [data-index]",
          );
          const section = paragraph?.closest<HTMLElement>("section[data-chapter]");
          if (paragraph && section) {
            const chapterNumber = parseInt(section.dataset.chapter || "0");
            const paragraphIndex = parseInt(paragraph.dataset.index || "0");
            const characterSlug = characterSpan.dataset.character || "";
            const textContent = characterSpan.textContent || "";

            event.preventDefault();
            event.stopPropagation();
            clearEditHover();
            openEditCharacterTagModalFn(chapterNumber, paragraphIndex, characterSlug, textContent);
            return;
          }
        }
      }

      const paragraph = target.closest<HTMLElement>("section[data-chapter] [data-index]");
      if (paragraph) {
        const section = paragraph.closest<HTMLElement>("section[data-chapter]");
        if (section) {
          const chapterNumber = parseInt(section.dataset.chapter || "0");
          const paragraphIndex = parseInt(paragraph.dataset.index || "0");
          const currentSpeaker = extractCurrentSpeaker(paragraph);

          if (openTalkingCharacterModalFn) {
            event.preventDefault();
            event.stopPropagation();
            clearEditHover();
            openTalkingCharacterModalFn(chapterNumber, paragraphIndex, currentSpeaker);
            return;
          }
        }
      }
    }

    const linkNote = target.classList.contains("link-note")
      ? target
      : (target.closest(".link-note") as HTMLElement | null);

    if (linkNote) {
      console.log("1148 linkNote", linkNote);

      event.preventDefault(); // Prevent default link navigation/jump

      const targetId = linkNote.getAttribute("href")?.substring(1); // Get href like '#fn3' and remove '#'
      if (targetId) {
        const noteElement = document.getElementById(targetId);
        if (noteElement) {
          // --- Modal Logic ---
          // Reuse or create modal elements
          let modal = document.getElementById("note-modal");
          let modalContent = document.getElementById("note-modal-content");
          let modalClose = document.getElementById("note-modal-close");
          let modalOverlay = document.getElementById("note-modal-overlay");

          const closeModal = () => {
            if (modal) modal.classList.remove("visible");
            if (modalOverlay) modalOverlay.classList.remove("visible");
            // Remove body class to allow scrolling again
            document.body.classList.remove("modal-open");
          };

          if (!modal) {
            // Create modal structure if it doesn't exist
            modalOverlay = document.createElement("div");
            modalOverlay.id = "note-modal-overlay";
            modalOverlay.onclick = closeModal; // Close on overlay click

            modal = document.createElement("div");
            modal.id = "note-modal";
            // modal.style.display = 'none'; // Let CSS handle initial display

            const modalDialog = document.createElement("div");
            modalDialog.id = "note-modal-dialog";

            modalClose = document.createElement("button");
            modalClose.id = "note-modal-close";
            modalClose.innerHTML = "&times;"; // Close symbol
            modalClose.onclick = closeModal; // Close on button click

            modalContent = document.createElement("div");
            modalContent.id = "note-modal-content";

            modalDialog.appendChild(modalClose);
            modalDialog.appendChild(modalContent);
            modal.appendChild(modalDialog);
            document.body.appendChild(modalOverlay);
            document.body.appendChild(modal);
          }

          // Ensure elements were found or created and assign content/display
          if (modal && modalContent && modalOverlay && modalClose) {
            // Replace potential space before the editorial note with a non-breaking space
            // and wrap the note itself to prevent internal breaks.
            const originalHTML = noteElement.innerHTML;
            const modifiedHTML = originalHTML
              .replace(
                /\s*(\[przypis edytorski\])/g,
                ' <br/><p class="przypis"><span style="white-space: nowrap;">$1</span></p>',
              )
              .replace(
                /\s*(\[przypis autorski\])/g,
                ' <br/><p class="przypis"><span style="white-space: nowrap;">$1</span></p>',
              );
            modalContent.innerHTML = modifiedHTML; // Use innerHTML to preserve formatting
            modal.classList.add("visible"); // Use class
            modalOverlay.classList.add("visible"); // Use class
            // Add body class to prevent background scrolling
            document.body.classList.add("modal-open");
          }
        }
      }
    }
  });
  // --- End Click Listener ---

  contentContainer.addEventListener("scroll", () => {
    if (scrollDebounce) clearTimeout(scrollDebounce);
    isScrolling = true;
    (window as unknown as { __sidebarScrollingLock: boolean }).__sidebarScrollingLock = true;
    scrollDebounce = setTimeout(() => {
      isScrolling = false;
      (window as unknown as { __sidebarScrollingLock: boolean }).__sidebarScrollingLock = false;
    }, 400);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Meta" || event.key === "Control") {
      if (currentHoveredParagraph && currentHoveredParagraph !== currentEditHoverElement) {
        clearEditHover();
        currentHoveredParagraph.classList.add("edit-hover");
        currentEditHoverElement = currentHoveredParagraph;
      }
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.key === "Meta" || event.key === "Control") {
      clearEditHover();

      if (openWrapWithCharacterModalFn) {
        const selectionInfo = getSelectionInfo();
        if (selectionInfo) {
          openWrapWithCharacterModalFn(
            selectionInfo.chapterNumber,
            selectionInfo.paragraphIndex,
            selectionInfo.selectedText,
            selectionInfo.occurrenceIndex,
          );
          window.getSelection()?.removeAllRanges();
        }
      }
    }
  });
}
