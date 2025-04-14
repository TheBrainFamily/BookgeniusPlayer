import { updatePageContext, updateChapterSummary, updateEntityNote, removeEntityNote, addEntityNote, EntityDefinition } from "../utils/pageMetadataEditor";
import { IEntityNote } from "../fetchers/PageMetadata";

// Define a type for the window with our global functions
declare global {
  interface Window {
    showCharacterDetailsModal?: (characterName: string, imageUrl: string, summary: string) => void;
  }
}

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
  container.style.position = "relative";
  container.style.display = "flex";
  container.style.alignItems = "flex-start";

  container.appendChild(element);

  let isEditing = false;
  let originalContent = text;
  const originalHeight = container.offsetHeight; // Get the original container height

  container.addEventListener("click", () => {
    if (!isEditing) {
      // Switch to edit mode
      isEditing = true;

      // Save original content
      originalContent = element.innerHTML;

      // Create textarea
      const textarea = document.createElement("textarea");
      textarea.value = originalContent.replace(/<br\/?>/g, "\\n").replace(/&nbsp;/g, " ");
      textarea.style.width = "100%";
      textarea.style.height = `${originalHeight}px`; // Set initial height
      textarea.style.padding = "8px";
      textarea.style.boxSizing = "border-box"; // Include padding in height calculation
      textarea.style.overflowY = "hidden"; // Hide scrollbar initially

      // Auto-resize textarea function
      const autoResizeTextarea = () => {
        textarea.style.height = "auto"; // Reset height to calculate scrollHeight correctly
        textarea.style.height = `${textarea.scrollHeight}px`; // Set height based on content
      };

      // Add event listener for input events
      textarea.addEventListener("input", autoResizeTextarea);

      // Create save button
      const saveButton = document.createElement("button");
      saveButton.textContent = "Save";
      saveButton.className = "save-button";
      saveButton.style.marginRight = "8px";
      saveButton.style.padding = "4px 8px";
      saveButton.style.backgroundColor = "#4a90e2";
      saveButton.style.color = "white";
      saveButton.style.border = "none";
      saveButton.style.borderRadius = "4px";
      saveButton.style.cursor = "pointer";

      // Create cancel button
      const cancelButton = document.createElement("button");
      cancelButton.textContent = "Cancel";
      cancelButton.className = "cancel-button";
      cancelButton.style.padding = "4px 8px";
      cancelButton.style.backgroundColor = "#ccc";
      cancelButton.style.color = "black";
      cancelButton.style.border = "none";
      cancelButton.style.borderRadius = "4px";
      cancelButton.style.cursor = "pointer";

      // Create button container
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "button-container";
      buttonContainer.style.marginTop = "8px";
      buttonContainer.style.display = "flex";

      buttonContainer.appendChild(saveButton);
      buttonContainer.appendChild(cancelButton);

      // Create edit container
      const editContainer = document.createElement("div");
      editContainer.className = "edit-container";
      editContainer.style.width = "100%";

      editContainer.appendChild(textarea);
      editContainer.appendChild(buttonContainer);

      // Replace container content with edit container
      container.innerHTML = "";
      container.appendChild(editContainer);

      // Set focus to textarea and trigger initial resize
      textarea.focus();
      autoResizeTextarea(); // Call resize initially to set correct height

      // Save button click handler
      saveButton.addEventListener("click", () => {
        const newText = textarea.value;

        // Update element with new text
        element.innerHTML = newText.replace(/\n/g, "<br>");

        // Restore container
        container.innerHTML = "";
        container.appendChild(element);

        // Reset editing state
        isEditing = false;

        // Call save callback
        saveCallback(newText);
      });

      // Cancel button click handler
      cancelButton.addEventListener("click", () => {
        // Restore container
        container.innerHTML = "";
        container.appendChild(element);

        // Reset editing state
        isEditing = false;
      });
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
    await updatePageContext(pageNumber, newText);
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
    await updateChapterSummary(pageNumber, newText);
  };

  const container = document.createElement("div");
  container.className = "chapter-summary-container";
  container.style.marginTop = "20px";

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
export function createEditableEntity(paragraphNumber: number, entity: IEntityNote): HTMLElement {
  const entityDiv = document.createElement("div");
  entityDiv.className = "entity-note";
  entityDiv.style.display = "flex";
  entityDiv.style.marginBottom = "20px";
  entityDiv.style.gap = "15px";
  entityDiv.style.alignItems = "center";
  entityDiv.style.overflow = "visible"; // Allow overflow on the main container

  // Get resolved character info (if any)
  // Use resolved image if available, otherwise use the original
  const imageUrl = entity.imageUrl;

  // Left column for image
  const imageColumn = document.createElement("div");
  imageColumn.className = "entity-image-column";
  imageColumn.style.flex = "1";
  imageColumn.style.overflow = "visible"; // Allow overflow

  // Right column for text content
  const textColumn = document.createElement("div");
  textColumn.className = "entity-text-column";
  textColumn.style.flex = "2";

  // Entity image in left column
  if (imageUrl) {
    // Create a wrapper div for the image
    const imageWrapper = document.createElement("div");
    imageWrapper.className = "entity-image-wrapper";
    imageWrapper.style.width = "100%"; // Or a fixed size if preferred
    imageWrapper.style.aspectRatio = "1 / 1";
    imageWrapper.style.borderRadius = "50%";
    imageWrapper.style.overflow = "hidden";
    imageWrapper.style.cursor = "pointer";
    imageWrapper.style.position = "relative"; // Needed for potential future additions like edit icons
    imageWrapper.style.zIndex = "1";

    const imageElement = document.createElement("img");
    imageElement.src = imageUrl;
    imageElement.alt = entity.canonicalName;
    imageElement.className = "entity-image";
    imageElement.style.width = "100%"; // Make image fill the wrapper
    imageElement.style.height = "100%"; // Make image fill the wrapper
    imageElement.style.display = "block"; // Ensure block display
    imageElement.style.objectFit = "cover";
    // No border-radius or aspect-ratio needed here anymore, handled by wrapper

    // Store character data in dataset for use in click handler (can remain on image or move to wrapper)
    imageElement.dataset.characterName = entity.canonicalName;
    imageElement.dataset.originalImageUrl = entity.imageUrl;
    imageElement.dataset.summary = entity.summary?.replace(/\n\n/g, "<br/>").replace(/\n/g, "<br/>") || "";

    // Add click event to wrapper to show details modal
    imageWrapper.addEventListener("click", () => {
      // Access the global function with proper typing
      if (typeof window.showCharacterDetailsModal === "function") {
        window.showCharacterDetailsModal(entity.canonicalName, imageUrl, entity.summary || "");
      }
    });

    // Append image to the wrapper, and wrapper to the column
    imageWrapper.appendChild(imageElement);
    imageColumn.appendChild(imageWrapper);
  }

  // Entity name in right column
  const nameElement = document.createElement("h4");
  nameElement.textContent = entity.canonicalName;
  nameElement.style.fontWeight = "bold";
  nameElement.style.marginTop = "0";
  textColumn.appendChild(nameElement);

  // Create editable entity summary
  const saveCallback = async (newText: string) => {
    console.log(`Saving character summary for ${entity.canonicalName}:`, newText);
    throw new Error("Not implemented saving character summary yet!");
    // await updateEntityNote(pageNumber, entity.canonicalName, { summary: newText });
  };

  const summaryText = entity.summary || "";
  const editableContent = createEditableText(summaryText.replace(/\n\n/g, "<br/>").replace(/\n/g, "<br/>").replace(/•/g, ""), "p", saveCallback);

  textColumn.appendChild(editableContent);

  // Add remove button
  // const removeButton = document.createElement("button");
  // removeButton.textContent = "Remove";
  // removeButton.className = "remove-character-button";
  // removeButton.style.marginTop = "10px";
  // removeButton.style.padding = "4px 8px";
  // removeButton.style.backgroundColor = "#e74c3c";
  // removeButton.style.color = "white";
  // removeButton.style.border = "none";
  // removeButton.style.borderRadius = "4px";
  // removeButton.style.cursor = "pointer";

  // removeButton.addEventListener("click", async () => {
  //   if (confirm(`Are you sure you want to remove ${entity.canonicalName} from this page?`)) {
  //     await removeEntityNote(pageNumber, entity.canonicalName);
  //     entityDiv.remove();
  //   }
  // });

  // textColumn.appendChild(removeButton);

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
  container.style.marginTop = "20px";
  container.style.marginBottom = "20px";

  const button = document.createElement("button");
  button.textContent = "Add Character";
  button.className = "add-character-button";
  button.style.padding = "8px 16px";
  button.style.backgroundColor = "#4a90e2";
  button.style.color = "white";
  button.style.border = "none";
  button.style.borderRadius = "4px";
  button.style.cursor = "pointer";

  container.appendChild(button);

  // Create character selector modal
  const modal = document.createElement("div");
  modal.className = "character-selector-modal";
  modal.style.display = "none";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.backgroundColor = "rgba(0,0,0,0.7)";
  modal.style.zIndex = "1000";
  modal.style.justifyContent = "center";
  modal.style.alignItems = "center";

  const modalContent = document.createElement("div");
  modalContent.className = "character-selector-modal-content";
  modalContent.style.backgroundColor = "white";
  modalContent.style.padding = "20px";
  modalContent.style.borderRadius = "8px";
  modalContent.style.maxWidth = "90%";
  modalContent.style.maxHeight = "90%";
  modalContent.style.overflow = "auto";
  modalContent.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";

  const modalHeader = document.createElement("div");
  modalHeader.style.display = "flex";
  modalHeader.style.justifyContent = "space-between";
  modalHeader.style.alignItems = "center";
  modalHeader.style.marginBottom = "20px";

  const modalTitle = document.createElement("h3");
  modalTitle.textContent = "Select a Character to Add";
  modalTitle.style.margin = "0";

  const closeButton = document.createElement("button");
  closeButton.innerHTML = "&times;";
  closeButton.style.background = "none";
  closeButton.style.border = "none";
  closeButton.style.cursor = "pointer";
  closeButton.style.fontSize = "24px";
  closeButton.style.padding = "0";
  closeButton.style.lineHeight = "1";

  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeButton);

  const charactersContainer = document.createElement("div");
  charactersContainer.className = "characters-grid";
  charactersContainer.style.display = "grid";
  charactersContainer.style.gridTemplateColumns = "repeat(auto-fill, minmax(120px, 1fr))";
  charactersContainer.style.gap = "15px";

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
        characterCard.style.border = "1px solid #eee";
        characterCard.style.borderRadius = "4px";
        characterCard.style.padding = "10px";
        characterCard.style.display = "flex";
        characterCard.style.flexDirection = "column";
        characterCard.style.alignItems = "center";
        characterCard.style.cursor = "pointer";

        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = name;
        img.style.width = "80px";
        img.style.height = "80px";
        img.style.borderRadius = "50%";
        img.style.objectFit = "cover";
        img.style.marginBottom = "8px";

        const characterName = document.createElement("div");
        characterName.textContent = name;
        characterName.style.textAlign = "center";
        characterName.style.fontSize = "14px";

        characterCard.appendChild(img);
        characterCard.appendChild(characterName);

        characterCard.addEventListener("click", async () => {
          modal.style.display = "none";

          const entityDef: EntityDefinition = { name, imageUrl };

          const entityNote: Partial<IEntityNote> = { entity: name, canonicalName: name, summary: `Character description for ${name}`, imageUrl };

          await addEntityNote(pageNumber, entityNote, entityDef);

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

// Add CSS styles to the document
export function addEditorStyles() {
  // Check if styles already exist
  if (document.getElementById("sidebar-editor-styles")) {
    return;
  }

  const styleElement = document.createElement("style");
  styleElement.id = "sidebar-editor-styles";

  styleElement.textContent = `
    .editable-text:hover {
      background-color: rgba(74, 144, 226, 0.1);
      border-radius: 4px;
      position: relative;
    }
    
    .edit-icon {
      visibility: hidden;
    }
    
    .editable-container:hover .edit-icon {
      visibility: visible;
    }
    
    .edit-container {
      width: 100%;
    }
    
    .button-container {
      margin-top: 8px;
      display: flex;
      gap: 8px;
    }
    
    .save-button, .cancel-button {
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    
    .save-button {
      background-color: #4a90e2;
      color: white;
    }
    
    .cancel-button {
      background-color: #ccc;
      color: black;
    }
    
    .remove-character-button {
      background-color: #e74c3c;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      margin-top: 10px;
    }

    /* Container for entity notes - center content vertically */
    .entity-notes-container {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 100%;
      padding: 10px 0;
      gap: 15px;
      width: 100%;
      overflow: visible;
    }

    /* Styles for the entity image wrapper */
    .entity-image-wrapper {
      transition: transform 0.2s ease-in-out, z-index 0s ease-in-out 0.2s; /* Add z-index transition */
      position: relative; /* Ensure z-index works */
      z-index: 1;
    }

    .entity-image-wrapper:hover {
      transform: scale(1.1); /* Scale the wrapper on hover */
      z-index: 10; /* Bring to front on hover */
    }

    /* Ensure image inside the wrapper behaves correctly */
    .entity-image {
       /* Styles moved to wrapper or already set in JS */
    }
  `;

  document.head.appendChild(styleElement);
}
