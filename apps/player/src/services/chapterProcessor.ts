/**
 * Per-Chapter XML Processor
 *
 * Processes a single chapter's XML content into HTML.
 * Character context is provided externally (from Convex), not extracted from XML.
 *
 * This is the "all-in Convex" version that works with individual chapters
 * rather than concatenating all chapters into one big XML document.
 */

import { wrapPunctuationAdvanced } from "./wrapPunctuation";
import { isElementNode, isTextNode, isLikelyCharacterTag, renderLineBreakSpan, renderEmElement, type InlineRenderOptions } from "@player/services/xmlDomHelpers";

// =============================================================================
// Types
// =============================================================================

export interface CharacterInfo {
  display: string;
  summary?: string;
}

export interface ProcessedChapter {
  html: string;
  paragraphCount: number;
  title?: string;
}

const renderStandardInlineElement = (element: Element, options: InlineRenderOptions): string => {
  const tagName = element.tagName.toLowerCase();
  switch (tagName) {
    case "note":
      if (options.bookSlug === "Lalka") {
        return `<a href="#fn${element.getAttribute("id")}" class="link-note">${element.textContent || element.getAttribute("id")}</a>`;
      }
      return "";
    case "b":
      return `<span class="bold">${element.textContent || ""}</span>`;
    case "i":
      return `<span class="italic">${element.textContent || ""}</span>`;
    case "strong":
      return `<strong>${(element.textContent || "").trim()}</strong>`;
    case "em":
      return renderEmElement(element);
    case "img": {
      const src = element.getAttribute("src") || "";
      const resolvedSrc = options.includeBookSlugInImgSrc ? `/books/${options.bookSlug}${src}` : src;
      return `<img src="${resolvedSrc}" />`;
    }
    default: {
      const eid = element.getAttribute("id");
      const idStr = eid ? ` id="${eid}"` : "";
      return `<${tagName}${idStr}>${element.textContent || ""}</${tagName}>`;
    }
  }
};

type CharacterRenderOptions = { isAtParagraphStart: boolean };
type CharacterRenderResult = { html: string; isTalking: boolean; slug: string };

const renderCharacterElement = (element: Element, characterMap: Map<string, CharacterInfo>, options: CharacterRenderOptions): CharacterRenderResult => {
  const slug = element.tagName;
  const isTalking = element.getAttribute("talking") === "true";

  if (isTalking) {
    const startOfParagraphClass = options.isAtParagraphStart ? " start-of-paragraph" : "";
    const spokenText = element.textContent || "";
    return {
      html: `<span class="character-placeholder character-talking${startOfParagraphClass}" data-character="${slug}" data-is-talking="true"></span>${spokenText ? `<strong>${spokenText}</strong>` : ""}`,
      isTalking: true,
      slug,
    };
  }

  if (element.getAttribute("dynasty") === "true") {
    return { html: element.textContent || "", isTalking: false, slug };
  }

  const charInfo = characterMap.get(slug) || characterMap.get(slug.toLowerCase());
  const displayText = element.textContent || charInfo?.display || slug;

  return { html: `<span class="character-highlighted" data-character="${slug}">${displayText}</span>`, isTalking: false, slug };
};

type ParagraphRenderContext = { characterMap: Map<string, CharacterInfo>; isLikelyCharacterTag: (tag: string) => boolean; bookSlug: string };

type ParagraphRenderResult = { content: string; hasTalkingCharacter: boolean };

const renderParagraphContent = (paragraph: Element, context: ParagraphRenderContext): ParagraphRenderResult => {
  let hasSignificantTextContent = false;
  let hasTalkingCharacter = false;

  const appendCharacterHtml = (element: Element): string => {
    const result = renderCharacterElement(element, context.characterMap, { isAtParagraphStart: !hasSignificantTextContent });
    if (result.isTalking) {
      hasTalkingCharacter = true;
    }
    return result.html;
  };

  const renderSpanWithId = (spanElement: Element): string => {
    const spanId = spanElement.getAttribute("id");
    if (!spanId) return "";

    let inner = "";
    for (const subNode of Array.from(spanElement.childNodes)) {
      if (isTextNode(subNode)) {
        const textContent = subNode.textContent || "";
        if (textContent.trim().length > 0) {
          hasSignificantTextContent = true;
        }
        inner += textContent;
        continue;
      }

      if (isElementNode(subNode)) {
        if (subNode.tagName === "LineBreak") {
          inner += renderLineBreakSpan();
        } else if (context.isLikelyCharacterTag(subNode.tagName)) {
          inner += appendCharacterHtml(subNode);
        } else {
          inner += renderStandardInlineElement(subNode, { bookSlug: context.bookSlug });
        }
      }
    }
    return `<span id="${spanId}">${inner}</span>`;
  };

  let content = "";
  for (const node of Array.from(paragraph.childNodes)) {
    if (isTextNode(node)) {
      const textContent = node.textContent || "";
      if (textContent.trim().length > 0) {
        hasSignificantTextContent = true;
      }
      content += textContent;
      continue;
    }

    if (isElementNode(node)) {
      const tagName = node.tagName;

      if (tagName === "LineBreak") {
        content += renderLineBreakSpan();
      } else if (tagName === "span" && node.hasAttribute("id")) {
        content += renderSpanWithId(node);
      } else if (context.isLikelyCharacterTag(tagName)) {
        content += appendCharacterHtml(node);
      } else {
        content += renderStandardInlineElement(node, { bookSlug: context.bookSlug });
      }
    }
  }

  return { content, hasTalkingCharacter };
};

// =============================================================================
// Polish Text Breaking
// =============================================================================

const ensureProperPolishTextBreaking = (html: string): string => {
  // Match single Polish conjunctions at word boundaries followed by space
  // Common orphaned conjunctions: a, i, o, u, w, z
  const orphanedConjunctionPattern = /\b([aiouwzAIOUWZ])\s+/g;
  return html.replace(orphanedConjunctionPattern, "$1&nbsp;");
};

// =============================================================================
// Main Chapter Processing Function
// =============================================================================

/**
 * Process a single chapter's XML content into HTML.
 *
 * @param chapterXml - The XML content for this chapter (wrapped in <Chapter> element or raw content)
 * @param characterContext - Map of character slugs to CharacterInfo (from Convex)
 * @param chapterId - The chapter ID number
 * @param bookSlug - The book's slug (e.g., "1984-English")
 * @param bookLang - The book's language (e.g., "english", "polish")
 * @param bookForm - The book's form (e.g., "book", "play", "mixed")
 */
export function processChapterXml(
  chapterXml: string,
  characterContext: Map<string, CharacterInfo>,
  chapterId: number,
  bookSlug: string,
  bookLang: string = "english",
  bookForm: string = "book",
): ProcessedChapter {
  const parser = new DOMParser();

  // Wrap content if not already wrapped in Chapter element
  let wrappedXml = chapterXml.trim();
  if (!wrappedXml.startsWith("<Chapter")) {
    wrappedXml = `<Chapter id="${chapterId}">${wrappedXml}</Chapter>`;
  }

  const xmlDoc = parser.parseFromString(wrappedXml, "text/xml");

  // Check for parse errors
  const parseError = xmlDoc.querySelector("parsererror");
  if (parseError) {
    console.error("[chapterProcessor] XML parse error:", parseError.textContent);
    throw new Error(`XML parse error: ${parseError.textContent}`);
  }

  const chapter = xmlDoc.getElementsByTagName("Chapter")[0];
  if (!chapter) {
    throw new Error("[chapterProcessor] No Chapter element found in XML");
  }

  const isPlayFormat = bookForm === "play" || bookForm === "mixed" || bookForm === "Play" || bookForm === "Mixed";

  // Render chapter content
  let paragraphCount = 0;
  let htmlResult = `<section data-chapter="${chapterId}">`;
  let title: string | undefined;

  const context: ParagraphRenderContext = { characterMap: characterContext, isLikelyCharacterTag, bookSlug };

  for (const node of Array.from(chapter.childNodes)) {
    if (!isElementNode(node)) continue;

    const tagName = node.tagName.toLowerCase();

    switch (tagName) {
      case "p": {
        const { content, hasTalkingCharacter } = renderParagraphContent(node, context);
        const isCharacter = hasTalkingCharacter ? ' data-is-character="true"' : "";
        htmlResult += `<p data-index="${paragraphCount}"${isCharacter}>${content}</p>`;
        paragraphCount++;
        break;
      }
      case "h3":
      case "act":
        htmlResult += `<h3 data-index="${paragraphCount}" data-act="true">${node.textContent || ""}</h3>`;
        paragraphCount++;
        break;
      case "h4":
      case "title":
        title = node.textContent || undefined;
        htmlResult += `<h4 data-index="${paragraphCount}">${node.textContent || ""}</h4>`;
        paragraphCount++;
        break;
      case "h5":
      case "subtitle":
        htmlResult += `<h5 data-index="${paragraphCount}">${node.textContent || ""}</h5>`;
        paragraphCount++;
        break;
      default:
        // Skip unknown elements but log them
        if (tagName !== "characteroverrides") {
          console.debug(`[chapterProcessor] Skipping unknown element: ${tagName}`);
        }
    }
  }

  htmlResult += "</section>";

  // Apply text processing
  if (bookLang === "polish" && !isPlayFormat) {
    htmlResult = ensureProperPolishTextBreaking(htmlResult);
  }

  htmlResult = wrapPunctuationAdvanced(htmlResult);

  return { html: htmlResult, paragraphCount, title };
}

/**
 * Build character context map from Convex character bundles.
 * Use this when you have character data from BookConvexContext.
 */
export function buildCharacterContext(characters: Array<{ slug: string; name: string; extra?: { displayName?: string; summary?: string } }>): Map<string, CharacterInfo> {
  const map = new Map<string, CharacterInfo>();

  for (const char of characters) {
    const display = char.extra?.displayName || char.name || char.slug;
    const summary = char.extra?.summary;

    // Index by slug (original case)
    map.set(char.slug, { display, summary });

    // Also index by lowercase for case-insensitive lookup
    if (char.slug.toLowerCase() !== char.slug) {
      map.set(char.slug.toLowerCase(), { display, summary });
    }

    // Also index by name if different from slug
    if (char.name && char.name !== char.slug) {
      map.set(char.name, { display, summary });
      if (char.name.toLowerCase() !== char.name) {
        map.set(char.name.toLowerCase(), { display, summary });
      }
    }
  }

  return map;
}
