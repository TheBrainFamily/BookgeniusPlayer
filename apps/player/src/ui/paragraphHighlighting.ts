import { getBookSlug } from "@player/state/bookDataStore";
import { activateCharacters } from "./characterHelpers";
import { getGlobalEditModeActive } from "@player/context/EditModeContext";

let isScrolling = false;
let scrollDebounce: NodeJS.Timeout;
let currentEditHoverElement: HTMLElement | null = null;

export type OpenTalkingCharacterModalFn = (chapterNumber: number, paragraphIndex: number, currentSpeaker: string | null) => void;
let openTalkingCharacterModalFn: OpenTalkingCharacterModalFn | null = null;

export function setOpenTalkingCharacterModal(fn: OpenTalkingCharacterModalFn): void {
  openTalkingCharacterModalFn = fn;
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
      const section = paragraph.closest<HTMLElement>("section[data-chapter]");
      if (!section) return;

      const chapterNumber = section.dataset.chapter;
      const paragraphNumber = paragraph.dataset.index;

      if (chapterNumber && paragraphNumber) {
        const chapterNum = parseInt(chapterNumber);
        const paragraphNum = parseInt(paragraphNumber);
        activateCharacters(chapterNum, paragraphNum, getBookSlug() || undefined);
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
    const stillInParagraph = relatedTarget?.closest<HTMLElement>("section[data-chapter] [data-index]");
    if (!stillInParagraph || stillInParagraph !== currentEditHoverElement) {
      clearEditHover();
    }
  });

  contentContainer.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    if (getGlobalEditModeActive()) {
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

    const linkNote = target.classList.contains("link-note") ? target : (target.closest(".link-note") as HTMLElement | null);

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
              .replace(/\s*(\[przypis edytorski\])/g, ' <br/><p class="przypis"><span style="white-space: nowrap;">$1</span></p>')
              .replace(/\s*(\[przypis autorski\])/g, ' <br/><p class="przypis"><span style="white-space: nowrap;">$1</span></p>');
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

  window.addEventListener("keyup", (event) => {
    if (event.key === "Meta" || event.key === "Control") {
      clearEditHover();
    }
  });
}
