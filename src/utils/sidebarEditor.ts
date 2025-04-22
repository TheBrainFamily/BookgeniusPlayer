import "./sidebarEditor.css";
import { BOOK_SLUGS } from "../consts";
import { updateCharacterChapterInfo } from "../fetchers/updateCharacterChapterInfo";
import { getCurrentBookSlug } from "../getCurrentBookSlug";
import { getPictureFilePathForName } from "./getFilePathsForName";

// Define a type for the window with our global functions
declare global {
  interface Window {
    showCharacterDetailsModal?: (characterName: string, imageUrl: string, summary: string) => void;
  }
}

// Define dummy types to resolve linter errors (replace with actual imports/definitions later)
// type EntityDefinition = { name: string; imageUrl: string }; // Removed unused type
// type IEntityNote = { entity: string; canonicalName: string; summary: string; imageUrl: string }; // Removed unused type

export const isEditActive = () => {
  return document.querySelector(".edit-container") !== null;
};

/**
 * Creates an editable text element
 * @param text Initial text content
 * @param elementType HTML element type ('p', 'div', etc.)
 * @param saveCallback Function to call when saving changes
 * @returns The editable HTML element
 */
export function createEditableText(text: string, elementType: string, saveCallback: (text: string) => void): HTMLElement {
  const element = document.createElement(elementType);
  element.innerHTML = text;
  element.className = "editable-text";

  // Add edit icon

  // Wrap content in container to position edit icon
  const container = document.createElement("div");
  container.className = "editable-container";

  container.appendChild(element);

  let isEditing = false;
  let originalContent = text;
  const originalHeight = container.offsetHeight; // Get the original container height

  container.addEventListener("mousedown", () => {
    if (!isEditing) {
      // Switch to edit mode
      isEditing = true;

      // Save original content
      originalContent = element.innerHTML;

      // Create textarea
      const textarea = document.createElement("textarea");
      textarea.value = originalContent.replace(/<br\/?>/g, "\\n").replace(/&nbsp;/g, " ");
      textarea.style.height = `${originalHeight}px`; // Set initial height

      // Create edit container
      const editContainer = document.createElement("div");
      editContainer.className = "edit-container";

      editContainer.appendChild(textarea);

      // Replace container content with edit container
      container.innerHTML = "";
      container.appendChild(editContainer);

      // Set focus to textarea and trigger initial resize
      textarea.focus();
      autoResizeTextarea(); // Call resize initially to set correct height

      // Auto-resize textarea function
      function autoResizeTextarea() {
        textarea.style.height = "auto"; // Reset height to calculate scrollHeight correctly
        textarea.style.height = `${textarea.scrollHeight}px`; // Set height based on content
      }

      // Add event listener for input events
      textarea.addEventListener("input", autoResizeTextarea);

      // --- Event Handling Logic ---
      const removeEditListeners = () => {
        document.removeEventListener("click", handleClickOutside, true);
        textarea.removeEventListener("keydown", handleKeyDown);
      };

      const performSave = () => {
        removeEditListeners();
        const newText = textarea.value;
        element.innerHTML = newText.replace(/\n/g, "<br>");
        container.innerHTML = "";
        container.appendChild(element);
        isEditing = false;
        saveCallback(newText);
      };

      const performCancel = () => {
        removeEditListeners();
        element.innerHTML = originalContent; // Restore original content
        container.innerHTML = "";
        container.appendChild(element);
        isEditing = false;
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault(); // Prevent newline in textarea
          performSave();
        } else if (event.key === "Escape") {
          performCancel();
        }
      };

      const handleClickOutside = (event: MouseEvent) => {
        if (!editContainer.contains(event.target as Node)) {
          performCancel();
        }
      };

      // Add event listeners
      textarea.addEventListener("keydown", handleKeyDown);
      // Use capture phase for click outside to catch clicks on other elements potentially stopping propagation
      document.addEventListener("click", handleClickOutside, true);
    }
  });

  return container;
}

/**
 * Creates an editable summary element
 * @param pageNumber Current page number
 * @param summaryText Initial summary text
 * @returns HTML element with editable summary
 */
export function createEditablePageSummary(pageNumber: number, summaryText: string): HTMLElement {
  const saveCallback = async (newText: string) => {
    console.log(`Saving page summary for page ${pageNumber}:`, newText);
    // await updatePageContext(pageNumber, newText);
    throw new Error("Not implemented saving page summary yet!");
  };

  const container = document.createElement("div");
  container.className = "page-summary-container";

  const heading = document.createElement("h3");
  heading.textContent = "Page summary";
  container.appendChild(heading);

  const editableContent = createEditableText(summaryText, "p", saveCallback);
  container.appendChild(editableContent);

  return container;
}

/**
 * Creates an editable chapter summary element
 * @param pageNumber Current page number
 * @param summaryText Initial chapter summary text
 * @returns HTML element with editable chapter summary
 */
export function createEditableChapterSummary(pageNumber: number, summaryText: string): HTMLElement {
  const saveCallback = async (newText: string) => {
    console.log(`Saving chapter summary for page ${pageNumber}:`, newText);
    throw new Error("Not implemented saving chapter summary yet!");
  };

  const container = document.createElement("div");
  container.className = "chapter-summary-container";

  const heading = document.createElement("h3");
  heading.textContent = "Chapter summary";
  container.appendChild(heading);

  const editableContent = createEditableText(summaryText, "p", saveCallback);
  container.appendChild(editableContent);

  return container;
}

/**
 * Creates an editable entity container with character info
 * @param pageNumber Current page number
 * @param entity Character/entity data
 * @returns HTML element with editable entity info
 */
export function createEditableEntity(entity: {
  imageUrl: string;
  canonicalName: string;
  summary: string;
  label?: string;
  paragraphNumber: number;
  isTalkingInFirstParagraph: boolean;
  chapterNumber: number;
  otherAppearances: { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean }[];
}): HTMLElement {
  const entityDiv = document.createElement("div");
  entityDiv.className = "entity-note";
  entityDiv.dataset.canonicalName = entity.canonicalName; // Store canonical name for easy access

  // Combine main appearance with other appearances
  const allAppearances = [
    { chapterNumber: entity.chapterNumber, paragraphNumber: entity.paragraphNumber, isTalkingInParagraph: entity.isTalkingInFirstParagraph },
    ...(entity.otherAppearances || []), // Ensure otherAppearances exists
  ];

  // Store all appearances as a JSON string
  entityDiv.dataset.appearances = JSON.stringify(allAppearances);

  // Left column for image
  const imageColumn = document.createElement("div");
  imageColumn.className = "entity-image-column";

  // Right column for text content
  const textColumn = document.createElement("div");
  textColumn.className = "entity-text-column";

  // Entity image in left column
  let mediaElement: HTMLImageElement | HTMLVideoElement | null = null;
  const bookSlug = getCurrentBookSlug();

  if (entity.imageUrl) {
    const imageWrapper = document.createElement("div");
    imageWrapper.className = "entity-image-wrapper";

    const originalSrc = entity.imageUrl === "UNKNOWN" ? getPictureFilePathForName(entity.canonicalName, bookSlug) : entity.imageUrl;

    const isVideo = originalSrc.endsWith(".mp4") || originalSrc.endsWith(".webm");

    if (isVideo) {
      // Handle video avatars
      mediaElement = document.createElement("video");
      mediaElement.src = originalSrc;
      mediaElement.autoplay = true;
      mediaElement.loop = true;
      mediaElement.muted = true;
      mediaElement.playsInline = true;
    } else {
      // Handle image avatars
      mediaElement = document.createElement("img");
      mediaElement.src = originalSrc;
      mediaElement.alt = entity.canonicalName;
    }

    mediaElement.dataset.originalSrc = originalSrc;
    mediaElement.className = "entity-image";
    mediaElement.dataset.characterName = entity.canonicalName;
    mediaElement.dataset.summary = entity.summary?.replace(/\n\n/g, "<br/>").replace(/\n/g, "<br/>") || "";

    imageWrapper.addEventListener("click", () => {
      if (typeof window.showCharacterDetailsModal === "function" && mediaElement) {
        window.showCharacterDetailsModal(entity.canonicalName, mediaElement.src, entity.summary || "");
      }
    });

    imageWrapper.appendChild(mediaElement);
    imageColumn.appendChild(imageWrapper);
  }

  // Entity name in right column
  const nameElement = document.createElement("h4");
  // Function to set the display name correctly
  const setDisplayName = () => {
    const displayLabel = entity.label && entity.label !== entity.canonicalName ? entity.label : null;
    nameElement.textContent = displayLabel ? `${displayLabel} (${entity.canonicalName})` : entity.canonicalName;
  };
  setDisplayName(); // Set initial display name

  nameElement.classList.add("editable-text");
  nameElement.contentEditable = "true"; // Make name editable

  let valueBeforeEdit = ""; // Variable to store the value when editing starts

  // Add focus/blur styling and manage edit state
  nameElement.addEventListener("focus", () => {
    // Set the editable content to the label if it exists and differs, otherwise the canonical name
    valueBeforeEdit = entity.label && entity.label !== entity.canonicalName ? entity.label : entity.canonicalName;
    nameElement.textContent = valueBeforeEdit;
  });
  // We will handle save/cancel logic entirely within the blur listener below

  textColumn.appendChild(nameElement);

  // Create editable entity summary save callback
  const saveSummaryCallback = async (newText: string) => {
    console.log(`Saving character summary for ${entity.canonicalName}:`, newText);
    try {
      const updatedData = await updateCharacterChapterInfo(
        BOOK_SLUGS.PHARAON, // Example book slug
        entity.canonicalName, // Example character name
        entity.chapterNumber, // Example chapter number
        { summary: newText }, // Data to update
      );
      console.log("Update successful:", updatedData);
    } catch (error) {
      console.error("Failed to update:", error);
    }
    // throw new Error("Not implemented saving character summary yet!");
  };

  // Create save callback specifically for the name (label)
  const saveNameCallback = async (newLabelValue: string) => {
    console.log(`Saving character label for ${entity.canonicalName} as: '${newLabelValue}'`);
    try {
      const updatedData = await updateCharacterChapterInfo(
        BOOK_SLUGS.PHARAON, // TODO: Make dynamic if needed
        entity.canonicalName, // Identifier for the character
        entity.chapterNumber,
        { label: newLabelValue }, // Update the label field (can be empty string)
      );
      console.log("Label update successful:", updatedData);

      // Find the specific chapter info in the returned data
      const updatedChapterInfo = updatedData.infoPerChapter.find((info) => info.chapter === entity.chapterNumber);

      if (updatedChapterInfo) {
        // Update local entity state (important!)
        entity.label = updatedChapterInfo.label;
      } else {
        console.warn("Could not find updated chapter info for chapter", entity.chapterNumber);
        // Fallback: update with the intended value, though it might be stale if API had other changes
        entity.label = newLabelValue;
      }

      // Update display based on the NEW state
      setDisplayName();
    } catch (error) {
      console.error("Failed to update label:", error);
      // Revert to the value before editing began on error
      nameElement.textContent = valueBeforeEdit;
      // Restore the non-edit display format
      setDisplayName();
    }
  };

  // Combined Blur listener for saving/canceling name edit
  nameElement.addEventListener("blur", () => {
    const newName = nameElement.textContent?.trim() ?? ""; // Ensure string, default to empty

    // Check if the trimmed new name is different from the value when editing started
    if (newName !== valueBeforeEdit) {
      // If the new name is empty or same as canonical, save empty string to clear label
      const labelToSave = newName === "" || newName === entity.canonicalName ? "" : newName;
      saveNameCallback(labelToSave);
      // The saveNameCallback will handle updating the display on success/failure
    } else {
      // No change detected, just reset the display format
      setDisplayName();
    }
  });

  const summaryText = entity.summary || "";
  const editableContent = createEditableText(summaryText.replace(/\n\n/g, "<br/>").replace(/\n/g, "<br/>").replace(/•/g, ""), "p", saveSummaryCallback);

  textColumn.appendChild(editableContent);

  // Add hover listeners for highlighting and image swap
  entityDiv.addEventListener("mouseenter", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let isTalkingSomewhere = false;
    try {
      const appearancesStr = entityDiv.dataset.appearances;
      if (!appearancesStr) return;
      const appearances: { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean }[] = JSON.parse(appearancesStr);

      appearances.forEach(({ chapterNumber, paragraphNumber, isTalkingInParagraph }) => {
        const targetParagraph = document.querySelector<HTMLElement>(`section[data-chapter="${chapterNumber}"] [data-index="${paragraphNumber}"]`);
        if (targetParagraph) {
          targetParagraph.classList.add("highlighted-paragraph");
          if (isTalkingInParagraph) {
            targetParagraph.classList.add("talking-paragraph");
            isTalkingSomewhere = true; // Mark if talking in any paragraph
          }
        }
      });
    } catch (e) {
      console.error("Error processing appearances for highlighting:", e);
    }
  });

  entityDiv.addEventListener("mouseleave", () => {
    try {
      const appearancesStr = entityDiv.dataset.appearances;
      if (!appearancesStr) return;
      const appearances: { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean }[] = JSON.parse(appearancesStr);

      appearances.forEach(({ chapterNumber, paragraphNumber }) => {
        const targetParagraph = document.querySelector<HTMLElement>(`section[data-chapter="${chapterNumber}"] [data-index="${paragraphNumber}"]`);
        if (targetParagraph) {
          targetParagraph.classList.remove("highlighted-paragraph", "talking-paragraph");
        }
      });
    } catch (e) {
      console.error("Error processing appearances for unhighlighting:", e);
    }
  });

  // Add both columns to the entity div
  entityDiv.appendChild(imageColumn);
  entityDiv.appendChild(textColumn);

  return entityDiv;
}

/**
 * Creates a button to add a new character to the page
 * @param pageNumber Current page number
 * @param leftNotes Reference to the left notes container for refreshing
 * @param fetchCharactersCallback Function to fetch all available characters
 * @returns HTML element with the add character button
 */
export function createAddCharacterButton(
  pageNumber: number,
  leftNotes: HTMLElement,
  fetchExistingCallback: () => Promise<{ [name: string]: string }>,
  refreshNotesCallback: (index: number) => Promise<void>,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "add-character-container";

  const button = document.createElement("button");
  button.textContent = "Add Character";
  button.className = "add-character-button";

  container.appendChild(button);

  // Create character selector modal
  const modal = document.createElement("div");
  modal.className = "character-selector-modal";

  const modalContent = document.createElement("div");
  modalContent.className = "character-selector-modal-content";

  const modalHeader = document.createElement("div");
  modalHeader.className = "character-selector-modal-header";

  const modalTitle = document.createElement("h3");
  modalTitle.className = "character-selector-modal-title";
  modalTitle.textContent = "Select a Character to Add";

  const closeButton = document.createElement("button");
  closeButton.className = "character-selector-modal-close";
  closeButton.innerHTML = "&times;";

  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeButton);

  const charactersContainer = document.createElement("div");
  charactersContainer.className = "characters-grid";

  modalContent.appendChild(modalHeader);
  modalContent.appendChild(charactersContainer);

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Open modal on button click
  button.addEventListener("click", async () => {
    charactersContainer.innerHTML = "Loading characters...";
    modal.style.display = "flex";

    try {
      const characters = await fetchExistingCallback();

      if (Object.keys(characters).length === 0) {
        charactersContainer.innerHTML = "<p>No characters available.</p>";
        return;
      }

      charactersContainer.innerHTML = "";

      Object.entries(characters).forEach(([name, imageUrl]) => {
        const characterCard = document.createElement("div");
        characterCard.className = "character-card";

        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = name;

        const characterName = document.createElement("div");
        characterName.className = "character-card-name";
        characterName.textContent = name;

        characterCard.appendChild(img);
        characterCard.appendChild(characterName);

        characterCard.addEventListener("click", async () => {
          modal.style.display = "none";

          throw new Error("Not implemented adding entity note yet!");
          // Refresh the notes panel to show the new character
          await refreshNotesCallback(pageNumber);
        });

        charactersContainer.appendChild(characterCard);
      });
    } catch (error) {
      charactersContainer.innerHTML = "<p>Error loading characters.</p>";
      console.error("Error loading characters:", error);
    }
  });

  // Close modal on close button or outside click
  closeButton.addEventListener("click", () => {
    modal.style.display = "none";
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  });

  return container;
}
