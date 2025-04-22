export function initializeNoteLinkBlinking() {
  // Set up hover behavior for note links
  const contentContainer = document.getElementById("content-container");
  if (!contentContainer) return;

  // Add event delegation for all link-note elements
  contentContainer.addEventListener("mouseover", (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("link-note") || target.closest(".link-note")) {
      const linkNote = target.classList.contains("link-note") ? target : (target.closest(".link-note") as HTMLElement);
      const targetId = linkNote.getAttribute("href")?.substring(1); // Get href like '#fn3' and remove '#'

      if (targetId) {
        const noteElement = document.getElementById(targetId);
        if (noteElement && noteElement.closest("#right-notes-scrollable-container")) {
          // Scroll the note into view smoothly
          // noteElement.scrollIntoView({ behavior: "smooth", block: "center" });

          // Add highlight-blink class to run animation
          noteElement.classList.add("highlight-blink");

          // Remove the class after animation completes
          setTimeout(() => {
            noteElement.classList.remove("highlight-blink");
          }, 2000); // Adjust timing based on your animation duration
        }
      }
    }
  });

  // Add mouseout handler to ensure highlight is removed when no longer hovering
  contentContainer.addEventListener("mouseout", (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("link-note") || target.closest(".link-note")) {
      const linkNote = target.classList.contains("link-note") ? target : (target.closest(".link-note") as HTMLElement);
      const targetId = linkNote.getAttribute("href")?.substring(1);

      if (targetId) {
        const noteElement = document.getElementById(targetId);
        if (noteElement) {
          // Remove highlight when mouse leaves the link
          setTimeout(() => {
            noteElement.classList.remove("highlight-blink");
          }, 500); // Short delay to allow user to move mouse to the note
        }
      }
    }
  });
}
