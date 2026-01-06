/**
 * Browser-compatible XML processing for live mode.
 *
 * This module wraps the shared XML rendering core with browser DOMParser
 * and XMLSerializer instances.
 */

import { wrapPunctuationAdvanced } from "../wrapPunctuation";
import {
  renderBookFromXmlDocument,
  renderChapterFromXmlDocument,
  type CharacterBundleInfo,
  type RenderBookResult,
  type RenderChapterResult,
} from "./xmlRendererCore";

// Re-export for convenience
export { wrapPunctuationAdvanced };
export type { CharacterBundleInfo, RenderBookResult, RenderChapterResult };

// =============================================================================
// Helpers
// =============================================================================

const parseXmlString = (xmlString: string): Document => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  const parseError = xmlDoc.querySelector("parsererror");
  if (parseError) {
    console.error("XML parse error:", parseError.textContent);
    throw new Error(`XML parse error: ${parseError.textContent}`);
  }

  return xmlDoc;
};

const normalizeChapterXml = (chapterXml: string, fallbackChapterId?: string | number): string => {
  const trimmed = chapterXml.trim();
  if (trimmed.startsWith("<Chapter")) {
    return trimmed;
  }
  const idAttr = fallbackChapterId !== undefined ? ` id="${fallbackChapterId}"` : "";
  return `<Chapter${idAttr}>${trimmed}</Chapter>`;
};

// =============================================================================
// Main Exports
// =============================================================================

/**
 * Convert book XML to complex HTML for the player.
 *
 * @param xmlString - The XML content (all chapters concatenated, wrapped in <Book>)
 * @param bookSlug - The book's slug (e.g., "1984-English")
 * @param bookLang - The book's language ("english", "polish", etc.)
 */
export const xmlToComplexHtml = (
  xmlString: string,
  bookSlug: string,
  bookLang: string,
  characterBundles: CharacterBundleInfo[],
  bookForm: string,
): RenderBookResult => {
  const xmlDoc = parseXmlString(xmlString);
  const serializer = new XMLSerializer();

  return renderBookFromXmlDocument(xmlDoc, {
    bookSlug,
    bookLang,
    bookForm,
    characterBundles,
    serializer,
  });
};

/**
 * Convert a single chapter XML string to HTML.
 *
 * @param chapterXml - XML content for a single chapter (with or without <Chapter> wrapper)
 * @param bookSlug - The book's slug
 * @param bookLang - The book's language
 * @param characterBundles - Character bundles for display names
 * @param bookForm - The book's form ("book", "play", "mixed")
 * @param fallbackChapterId - Used if the XML lacks a Chapter id attribute
 */
export const renderChapterXmlToHtml = (
  chapterXml: string,
  bookSlug: string,
  bookLang: string,
  characterBundles: CharacterBundleInfo[],
  bookForm: string,
  fallbackChapterId?: string | number,
): RenderChapterResult => {
  const normalizedXml = normalizeChapterXml(chapterXml, fallbackChapterId);
  const xmlDoc = parseXmlString(normalizedXml);
  const serializer = new XMLSerializer();

  const chapter = xmlDoc.getElementsByTagName("Chapter")[0];
  if (chapter && !chapter.getAttribute("id") && fallbackChapterId !== undefined) {
    chapter.setAttribute("id", String(fallbackChapterId));
  }

  return renderChapterFromXmlDocument(xmlDoc, {
    bookSlug,
    bookLang,
    bookForm,
    characterBundles,
    serializer,
  });
};
