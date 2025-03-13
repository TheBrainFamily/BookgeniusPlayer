let _isMobileCharactersVisible = localStorage.getItem("mobileCharactersVisible") === "true" ? true : false; // Track if character strip is visible on mobile
export const isMobileCharactersVisible = () => _isMobileCharactersVisible;
export const setIsMobileCharactersVisible = (visible: boolean) => {
  _isMobileCharactersVisible = visible;
};
// Lock to prevent multiple toggle operations at once
let isTogglingMobileCharacters = false;

export const getIsTogglingMobileCharacters = () => isTogglingMobileCharacters;
const setIsTogglingMobileCharacters = (visible: boolean) => {
  isTogglingMobileCharacters = visible;
  // Save to local storage
  localStorage.setItem("mobileCharactersVisible", visible.toString());
};

// Toggle mobile character strip
export function toggleMobileCharacters() {
  console.log("running toggleMobileCharacters");
  // Prevent multiple concurrent toggles
  if (getIsTogglingMobileCharacters()) return;

  console.log("continuing, nothing in progress");

  const verticalStrip = document.getElementById("mobile-character-strip");
  const horizontalStrip = document.getElementById("mobile-horizontal-character-strip");
  const contentContainer = document.getElementById("content-container");
  console.log("verticalStrip", verticalStrip);
  console.log("horizontalStrip", horizontalStrip);
  console.log("contentContainer", contentContainer);
  if (!verticalStrip || !horizontalStrip || !contentContainer) return;

  // Set the lock
  setIsTogglingMobileCharacters(true);

  // Get visible page elements before toggle for a fallback approach
  const visiblePageElements = Array.from(document.querySelectorAll(".page.active"));
  const firstVisiblePage = visiblePageElements.length > 0 ? visiblePageElements[0] : null;
  const firstVisiblePageId = firstVisiblePage ? firstVisiblePage.id : null;

  // Toggle visibility state
  setIsMobileCharactersVisible(!isMobileCharactersVisible());

  document.getElementById("legacy")!.classList.toggle("characters-hidden", !isMobileCharactersVisible());

  // STEP 4: Now animate the strips with smooth transitions
  // Toggle vertical strip visibility
  verticalStrip.classList.toggle("hidden", !isMobileCharactersVisible());

  // Toggle horizontal strip visibility (opposite of vertical)
  horizontalStrip.classList.toggle("hidden", isMobileCharactersVisible());

  // Release the lock after the animation is complete
  setTimeout(() => {
    // Do a final position check and adjustment if needed
    if (firstVisiblePageId) {
      const targetPage = document.getElementById(firstVisiblePageId);
      targetPage?.scrollIntoView({ behavior: "instant", block: "start" });
    } else {
      console.log("[TOGGLE MOBILE CHARACTERS] no first visible page");
    }

    setIsTogglingMobileCharacters(false);
  }, 50);
}
