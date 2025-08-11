let listenerSet = false;
export function toggleBookContainerVisibilityWithShortcut() {
  if (listenerSet) return;
  function onKeyDown(e: KeyboardEvent) {
    console.log("onKeyDown", e);
    // Check for Shift + H (case-insensitive) and Command (Meta) key on macOS
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const isCommand = isMac ? e.metaKey : e.ctrlKey; // Use Command on Mac, Ctrl elsewhere
    if ((e.key === "h" || e.key === "H") && e.shiftKey && isCommand) {
      const bookContainer = document.getElementById("book-container");
      if (bookContainer) {
        bookContainer.style.opacity = bookContainer.style.opacity === "0" ? "1" : "0";
      }
      // Prevent default to avoid accidental browser shortcuts
      e.preventDefault();
    }
  }
  listenerSet = true;
  window.addEventListener("keydown", onKeyDown);
}
