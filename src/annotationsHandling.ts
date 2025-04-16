export function initializeNoteLinkBlinking() {
  const noteLinks: NodeListOf<HTMLAnchorElement> = document.querySelectorAll("a.link-note");

  const blinkElement = (element: HTMLElement | null) => {
    if (!element) return;

    // --- End reduced motion check ---

    // --- Ensure the element is visible BEFORE trying to animate ---
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.display === "none") {
      element.style.display = "block"; // Explicitly set display
    }
    // --- End visibility check ---

    const blinkClass = "highlight-blink"; // CSS class for the effect

    // Add the class to trigger the animation
    element.classList.add(blinkClass);

    const onAnimationStart = () => {
      element.removeEventListener("animationstart", onAnimationStart);
    };

    const onAnimationEnd = () => {
      element.classList.remove(blinkClass);
    };

    element.addEventListener("animationstart", onAnimationStart, { once: true });
    element.addEventListener("animationend", onAnimationEnd, { once: true }); // { once: true } ensures the listener is removed after firing
  };

  noteLinks.forEach((link) => {
    console.log("NOTES noteLinks SETUP INTERACTION", link);
    const handleInteraction = (event: MouseEvent | FocusEvent) => {
      console.log("NOTES handleInteraction", event);
      // For click events, prevent the default jump-to-anchor behavior
      // if you only want the blink without scrolling. Keep it if you want both.
      if (event.type === "click") {
        event.preventDefault();
      }

      const href = link.getAttribute("href");
      if (!href || !href.startsWith("#")) {
        console.warn("Link-note href is missing or invalid:", link);
        return;
      }

      try {
        // Use querySelector for robustness, getElementById needs IDs without CSS syntax
        const targetId = href; // Keep the '#' for querySelector
        const targetElement = document.querySelector<HTMLElement>(targetId);

        if (targetElement) {
          blinkElement(targetElement);
          // Optional: If you want to scroll the target into view as well
          // targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          console.warn(`Target element with selector "${targetId}" not found.`);
        }
      } catch (e) {
        console.error(`Error finding or processing target for selector "${href}":`, e);
      }
    };

    // Trigger on hover (mouseover)
    link.addEventListener("mouseover", handleInteraction);

    // Trigger on click
    link.addEventListener("click", handleInteraction);

    // Optional: Trigger on focus (for keyboard navigation)
    // link.addEventListener('focus', handleInteraction);
  });
}
