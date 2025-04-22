// Character modal interactions

// Current character being edited/viewed
let currentCharacter: { name: string; imageUrl: string } | null = null;

// Type definition for the character details modal function
export type ShowCharacterDetailsModalType = (characterName: string, imageUrl: string, summary?: string) => void;

// Show character details modal
export const showCharacterDetailsModal: ShowCharacterDetailsModalType = (characterName: string, imageUrl: string, summary?: string) => {
  const characterDetailsModal = document.getElementById("character-details-modal")!;
  const modalDetailsCharacterName = document.getElementById("modal-details-character-name")!;
  const modalDetailsCharacterImage = document.getElementById("modal-details-character-image") as HTMLImageElement;
  const modalDetailsCharacterSummary = document.getElementById("modal-details-character-summary")!;

  // Update modal content
  if (!modalDetailsCharacterName || !modalDetailsCharacterImage || !modalDetailsCharacterSummary) {
    console.error("Error creating modalDetailsCharacterImage");
    return;
  }

  modalDetailsCharacterName.textContent = characterName;
  modalDetailsCharacterImage.src = imageUrl;
  modalDetailsCharacterImage.alt = characterName;
  modalDetailsCharacterSummary.textContent = summary || "No additional information available.";

  // Add click event to show edit modal on image click
  modalDetailsCharacterImage.onclick = () => {
    hideCharacterDetailsModal();
    showCharacterModal(characterName, imageUrl);
  };

  // Show modal
  characterDetailsModal.classList.add("active");
};

// Hide character details modal
export function hideCharacterDetailsModal() {
  const characterDetailsModal = document.getElementById("character-details-modal")!;
  characterDetailsModal.classList.remove("active");
}

// Show character edit modal
export function showCharacterModal(characterName: string, imageUrl: string) {
  const characterModal = document.getElementById("character-modal")!;
  const modalCharacterName = document.getElementById("modal-character-name")!;
  const modalCharacterImage = document.getElementById("modal-character-image") as HTMLImageElement;

  // Set current character data
  currentCharacter = { name: characterName, imageUrl: imageUrl };

  // Update modal content
  modalCharacterName.textContent = characterName;
  modalCharacterImage.src = imageUrl;
  modalCharacterImage.alt = characterName;

  // Show modal
  characterModal.classList.add("active");
}

// Hide character edit modal
export function hideCharacterModal() {
  const characterModal = document.getElementById("character-modal")!;
  characterModal.classList.remove("active");
  // Reset current character
  currentCharacter = null;
}

// Clear cache for a specific character
export function clearCharacterFromCache(characterName: string) {
  // Define these variables to match the ones in main.ts
  const pageMetadataCache = {};
  const imageCache = {};

  // Iterate through all cached pages and clear this character's data
  Object.keys(pageMetadataCache).forEach((pageKey) => {
    const page = pageMetadataCache[pageKey];
    if (page && page.metadata && page.metadata.notesForPage) {
      // Mark the cache as needing refresh for this character
      page.needsRefresh = true;
    }
  });

  // Also clear from image cache
  Object.keys(imageCache).forEach((key) => {
    if (key.includes(characterName)) {
      delete imageCache[key];
    }
  });
}

// Create character image
export async function createCharacterImage(characterName: string) {
  try {
    const response = await fetch(`/api/characters/createImage/pharaon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create character image: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error creating character image:", error);
    return null;
  }
}

// Initialize character modal event listeners
export function initCharacterModals() {
  const characterModal = document.getElementById("character-modal")!;
  const characterModalClose = characterModal.querySelector(".modal-close")!;
  const createImageButton = document.getElementById("create-image-button")!;
  const characterDetailsModal = document.getElementById("character-details-modal")!;
  const characterDetailsModalClose = characterDetailsModal.querySelector(".modal-close")!;

  // Event listeners for modals
  characterModalClose.addEventListener("click", hideCharacterModal);
  characterDetailsModalClose.addEventListener("click", hideCharacterDetailsModal);

  createImageButton.addEventListener("click", async () => {
    if (!currentCharacter) return;

    try {
      const result = await createCharacterImage(currentCharacter.name);
      if (result) {
        alert(`Image for ${currentCharacter.name} created successfully`);
        // Clear from cache and update view
        clearCharacterFromCache(currentCharacter.name);
      }
    } catch (error) {
      alert(`Error creating image: ${error.message}`);
    }

    hideCharacterModal();
  });
}
