/**
 * Utility to dynamically load optional book-specific color CSS files
 */

const loadedBookColorFiles = new Set<string>();

export const loadBookColorsCSS = async (bookSlug: string): Promise<void> => {
  const cssPath = `/books/${bookSlug}/book-colors.css`;

  // Avoid loading the same file multiple times
  if (loadedBookColorFiles.has(cssPath)) {
    return;
  }

  try {
    // Check if the file exists by attempting to fetch it
    const response = await fetch(cssPath, { method: "HEAD" });

    if (response.ok) {
      // Create and append a link element to load the CSS
      const linkElement = document.createElement("link");
      linkElement.rel = "stylesheet";
      linkElement.href = cssPath;
      linkElement.id = `book-colors-${bookSlug}`;

      document.head.appendChild(linkElement);
      loadedBookColorFiles.add(cssPath);

      console.log(`✓ Loaded optional book colors for: ${bookSlug}`);
    }
  } catch (error) {
    // Silently fail if the file doesn't exist - it's optional
    console.log(`No custom colors found for book: ${bookSlug}`);
  }
};

export const unloadBookColorsCSS = (bookSlug: string): void => {
  const linkElement = document.getElementById(`book-colors-${bookSlug}`);
  if (linkElement) {
    document.head.removeChild(linkElement);
    loadedBookColorFiles.delete(`/books/${bookSlug}/book-colors.css`);
    console.log(`✓ Unloaded book colors for: ${bookSlug}`);
  }
};
