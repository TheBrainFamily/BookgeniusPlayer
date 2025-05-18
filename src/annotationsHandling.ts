export function initializeNoteLinkBlinking() {
  const noteLinks: NodeListOf<HTMLAnchorElement> = document.querySelectorAll("a.link-note");

  const handleInteraction = (element: HTMLElement | null) => {
    if (!element) return;

    // --- Ensure the element is visible BEFORE trying to highlight ---
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.display === "none") {
      element.style.display = "block"; // Explicitly set display
    }
    // --- End visibility check ---

    const highlightClass = "highlight-note"; // Consistent highlighting class

    // Add the class to trigger the highlight
    element.classList.add(highlightClass);
  };

  const removeHighlight = (element: HTMLElement | null) => {
    if (!element) return;
    element.classList.remove("highlight-note");
  };

  noteLinks.forEach((link) => {
    // Handle mouseover - add highlight
    link.addEventListener("mouseover", () => {
      const href = link.getAttribute("href");
      if (!href || !href.startsWith("#")) {
        console.warn("Link-note href is missing or invalid:", link);
        return;
      }

      try {
        const targetId = href; // Keep the '#' for querySelector
        const targetElement = document.querySelector<HTMLElement>(targetId);

        if (targetElement) {
          handleInteraction(targetElement);
        } else {
          console.warn(`Target element with selector "${targetId}" not found.`);
        }
      } catch (e) {
        console.error(`Error finding or processing target for selector "${href}":`, e);
      }
    });

    // Handle mouseout - remove highlight
    link.addEventListener("mouseout", () => {
      const href = link.getAttribute("href");
      if (!href || !href.startsWith("#")) return;

      try {
        const targetId = href;
        const targetElement = document.querySelector<HTMLElement>(targetId);

        if (targetElement) {
          removeHighlight(targetElement);
        }
      } catch (e) {
        console.error(`Error finding or processing target for selector "${href}":`, e);
      }
    });

    // Handle click for navigation
    link.addEventListener("click", (event) => {
      event.preventDefault();

      const href = link.getAttribute("href");
      if (!href || !href.startsWith("#")) {
        console.warn("Link-note href is missing or invalid:", link);
        return;
      }

      try {
        const targetId = href;
        const targetElement = document.querySelector<HTMLElement>(targetId);

        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } catch (e) {
        console.error(`Error finding or processing target for selector "${href}":`, e);
      }
    });
  });
}
