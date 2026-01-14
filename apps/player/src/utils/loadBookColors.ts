/**
 * Utility to dynamically load optional book-specific color CSS files
 */

import { getBookSlug } from "@player/state/bookDataStore";
import { getBookAssetUrl } from "./assetUrls";

const verifiedBookColorPaths = new Map<string, string>();
const LINK_ID_PREFIX = "book-colors-";

function removeExistingBookColorLinks(): void {
  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>(`link[id^="${LINK_ID_PREFIX}"]`),
  );

  for (const link of links) {
    const slug = link.dataset.bookSlug ?? link.id.replace(LINK_ID_PREFIX, "");
    document.head.removeChild(link);
    console.log(`✓ Unloaded book colors for: ${slug}`);
  }
}

function attachBookColorLink(bookSlug: string, cssPath: string): void {
  const linkElement = document.createElement("link");
  linkElement.rel = "stylesheet";
  linkElement.href = cssPath;
  linkElement.id = `${LINK_ID_PREFIX}${bookSlug}`;
  linkElement.dataset.bookSlug = bookSlug;

  document.head.appendChild(linkElement);
  console.log(`✓ Loaded optional book colors for: ${bookSlug}`);
}

export const loadBookColorsCSS = async (): Promise<void> => {
  const bookSlug = getBookSlug();
  if (!bookSlug) {
    return;
  }

  // Always clear previously injected book colors so they do not bleed into the new book.
  removeExistingBookColorLinks();
  const cssPath = getBookAssetUrl("book-colors.css");
  if (!cssPath) {
    return;
  }

  try {
    const verifiedPath = verifiedBookColorPaths.get(bookSlug);

    if (verifiedPath === cssPath) {
      attachBookColorLink(bookSlug, cssPath);
      return;
    }

    const response = await fetch(cssPath, { method: "HEAD" });

    if (!response.ok) {
      console.log(`No custom colors found for book: ${bookSlug}`);
      return;
    }

    attachBookColorLink(bookSlug, cssPath);
    verifiedBookColorPaths.set(bookSlug, cssPath);
  } catch {
    console.log(`No custom colors found for book: ${bookSlug}`);
  }
};

export const unloadBookColorsCSS = (): void => {
  removeExistingBookColorLinks();
};
