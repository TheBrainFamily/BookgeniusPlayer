/**
 * XML rendering core shared by browser and server environments.
 *
 * This module contains DOM-agnostic logic for rendering XML chapters into HTML.
 * Consumers must provide an XMLSerializer-compatible instance.
 */

import { wrapPunctuationAdvanced } from "../wrapPunctuation";
import {
  isElementNode,
  isTextNode,
  isLikelyCharacterTag,
  renderLineBreakSpan,
  renderEmElement,
} from "../xmlDomHelpers";
import { getFigureUrl } from "@player/utils/assetUrls";

// =============================================================================
// Types
// =============================================================================

export type CharacterBundleInfo = {
  slug: string;
  name: string;
  metadata: { displayName?: string; summary?: string };
  avatar?: { url: string };
  listens?: { url: string };
  speaks?: { url: string };
};

type CharacterInfo = { display: string };

import type { Node as XmlDomNode } from "@xmldom/xmldom";

type AnyNode = Node | XmlDomNode;

export type XmlSerializerLike = {
  serializeToString(node: AnyNode, nodeFilter?: (node: AnyNode) => boolean): string;
};

export type RenderOptions = {
  bookSlug: string;
  bookLang: string;
  bookForm: string;
  characterBundles: CharacterBundleInfo[];
  serializer: XmlSerializerLike;
};

export type RenderBookResult = {
  htmlResult: string;
  chapterTitles: Array<{ id: string; title: string }>;
};

export type RenderChapterResult = { html: string; title: string; chapterId: string };

// =============================================================================
// Helper Functions
// =============================================================================

const startsWithUppercase = (value: string): boolean =>
  value.charAt(0) === value.charAt(0).toUpperCase();

const getTitleText = (el?: Element | null) => (el ? (el.textContent || "").trim() : "");

const renderStandardInlineElement = (
  element: Element,
  options: { bookSlug: string; includeBookSlugInImgSrc?: boolean },
): string => {
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
      const alt = element.getAttribute("alt") || "";
      // Try to resolve figure URL from registry (for SE book figures)
      const figureUrl = getFigureUrl(src);
      const resolvedSrc =
        figureUrl || (options.includeBookSlugInImgSrc ? `/books/${options.bookSlug}${src}` : src);
      const altAttr = alt ? ` alt="${alt.replace(/"/g, "&quot;")}"` : "";
      return `<img src="${resolvedSrc}"${altAttr} />`;
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

const renderCharacterElement = (
  element: Element,
  characterMap: Map<string, CharacterInfo>,
  options: CharacterRenderOptions,
): CharacterRenderResult => {
  const tagName = element.tagName;
  const slug = tagName.toLowerCase(); // Lowercase to match Convex folder slugs
  const isTalking = element.getAttribute("talking") === "true";
  const isEntering = element.getAttribute("enters") === "true";
  const isExiting = element.getAttribute("exits") === "true";

  if (isTalking) {
    const startOfParagraphClass = options.isAtParagraphStart ? " start-of-paragraph" : "";
    const spokenText = element.textContent || "";
    // Build enters/exits attributes for talking characters (e.g., Wukong has enters="true" talking="true")
    let enterExitAttrs = "";
    if (isEntering) enterExitAttrs += ' data-enters="true"';
    if (isExiting) enterExitAttrs += ' data-exits="true"';
    return {
      html: `<span class="character-placeholder character-talking${startOfParagraphClass}" data-character="${slug}" data-is-talking="true"${enterExitAttrs}></span>${spokenText ? `<strong>${spokenText}</strong>` : ""}`,
      isTalking: true,
      slug,
    };
  }

  if (element.getAttribute("dynasty") === "true") {
    return { html: element.textContent || "", isTalking: false, slug };
  }

  const charInfo = characterMap.get(tagName) ?? characterMap.get(slug);
  const displayText = element.textContent || (charInfo?.display ?? tagName);

  // Build data attributes for enters/exits (used by characters-on-stage panel)
  const dataAttrs = [`data-c="${slug}"`];
  if (isEntering) dataAttrs.push('data-enters="true"');
  if (isExiting) dataAttrs.push('data-exits="true"');

  return { html: `<span ${dataAttrs.join(" ")}>${displayText}</span>`, isTalking: false, slug };
};

type ParagraphRenderContext = {
  characterMap: Map<string, CharacterInfo>;
  isLikelyCharacterTag: (tag: string) => boolean;
  bookSlug: string;
};

type ParagraphRenderResult = { content: string; hasTalkingCharacter: boolean };

const renderParagraphContent = (
  paragraph: Element,
  context: ParagraphRenderContext,
): ParagraphRenderResult => {
  let hasSignificantTextContent = false;
  let hasTalkingCharacter = false;

  const appendCharacterHtml = (element: Element): string => {
    const result = renderCharacterElement(element, context.characterMap, {
      isAtParagraphStart: !hasSignificantTextContent,
    });
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
          continue;
        }

        const looksLikeCharacter =
          context.characterMap.has(subNode.tagName) ||
          context.isLikelyCharacterTag(subNode.tagName);
        if (looksLikeCharacter) {
          inner += appendCharacterHtml(subNode);
          continue;
        }

        inner += renderStandardInlineElement(subNode, { bookSlug: context.bookSlug });
      }
    }

    return `<span id="${spanId}">${inner}</span>`;
  };

  let paragraphContent = "";
  for (const node of Array.from(paragraph.childNodes)) {
    if (isTextNode(node)) {
      const textContent = node.textContent || "";
      if (textContent.trim().length > 0) {
        hasSignificantTextContent = true;
      }
      paragraphContent += textContent;
      continue;
    }

    if (isElementNode(node)) {
      if (node.tagName.toLowerCase() === "span" && node.hasAttribute("id")) {
        paragraphContent += renderSpanWithId(node);
        continue;
      }

      if (node.tagName === "LineBreak") {
        paragraphContent += renderLineBreakSpan();
        continue;
      }

      const looksLikeCharacter =
        context.characterMap.has(node.tagName) || context.isLikelyCharacterTag(node.tagName);
      if (looksLikeCharacter) {
        paragraphContent += appendCharacterHtml(node);
        continue;
      }

      hasSignificantTextContent = true;
      paragraphContent += renderStandardInlineElement(node, {
        bookSlug: context.bookSlug,
        includeBookSlugInImgSrc: true,
      });
    }
  }

  return { content: paragraphContent, hasTalkingCharacter };
};

// =============================================================================
// Format B State (compact storage format for plays)
// =============================================================================

/**
 * Format B outputs compact HTML for storage:
 * - Speaker blocks: <div data-speaker="slug" data-label="LABEL">paragraphs</div>
 * - Stage directions: <p data-is-didaskalia="true">content</p>
 *
 * This is expanded to verbose play-row structure at render time by htmlNormalizer.
 */
class FormatBState {
  private currentSpeaker: string | null = null;
  private currentLabel: string | null = null;
  private currentEnters: boolean = false;
  private currentExits: boolean = false;
  private pendingParagraphs: string[] = [];
  private output: string[] = [];

  /**
   * Start or continue a speaker block. If speaker changes, flush previous block.
   */
  setSpeaker(slug: string, label: string, enters: boolean = false, exits: boolean = false): void {
    if (this.currentSpeaker !== slug) {
      this.flush();
      this.currentSpeaker = slug;
      this.currentLabel = label;
      this.currentEnters = enters;
      this.currentExits = exits;
    }
  }

  /**
   * Add a content paragraph to the current speaker block.
   * If no speaker is active, outputs as standalone paragraph.
   */
  addParagraph(html: string): void {
    if (this.currentSpeaker) {
      this.pendingParagraphs.push(html);
    } else {
      // No active speaker - output as standalone paragraph
      this.output.push(`<p>${html}</p>`);
    }
  }

  /**
   * Add a standalone didaskalia paragraph (flushes any open speaker block).
   */
  addDidaskalia(html: string): void {
    this.flush();
    this.output.push(`<p data-is-didaskalia="true">${html}</p>`);
  }

  /**
   * Flush any pending speaker block to output.
   */
  flush(): void {
    if (this.currentSpeaker) {
      // Build data attributes
      let attrs = `data-speaker="${this.currentSpeaker}" data-label="${this.currentLabel}"`;
      if (this.currentEnters) attrs += ' data-enters="true"';
      if (this.currentExits) attrs += ' data-exits="true"';

      if (this.pendingParagraphs.length > 0) {
        const paragraphs = this.pendingParagraphs.map((p) => `<p>${p}</p>`).join("\n");
        this.output.push(`<div ${attrs}>\n${paragraphs}\n</div>`);
      } else {
        // Speaker with no content paragraphs - still output the div for enters/exits tracking
        this.output.push(`<div ${attrs}></div>`);
      }
    }
    this.currentSpeaker = null;
    this.currentLabel = null;
    this.currentEnters = false;
    this.currentExits = false;
    this.pendingParagraphs = [];
  }

  /**
   * Get the final HTML output.
   */
  getOutput(): string {
    this.flush();
    return this.output.join("\n");
  }
}

// =============================================================================
// Play Row State (legacy verbose format - kept for non-play formats)
// =============================================================================

class PlayRowState {
  private rowOpen = false;
  private didaskaliaRowOpen = false;

  isRowOpen(): boolean {
    return this.rowOpen;
  }

  isDidaskaliaRowOpen(): boolean {
    return this.didaskaliaRowOpen;
  }

  openCharacterRow(alignment: "left" | "right", hasAvatar: boolean, avatarHtml: string): string {
    let result = "";
    if (this.rowOpen) {
      result += this.closeRow();
    }

    const rowClass = hasAvatar ? "" : " didaskalia-row";
    result += `\n <div class="play-row${rowClass}" data-text-alignment="${alignment}">\n`;
    if (hasAvatar) {
      result += `\n  <div class="character-avatar">${avatarHtml}</div>\n`;
    }
    result += `\n  <div class="character-text">\n`;

    this.rowOpen = true;
    this.didaskaliaRowOpen = false;
    return result;
  }

  ensureDidaskaliaRow(): string {
    let result = "";

    if (this.rowOpen && !this.didaskaliaRowOpen) {
      result += this.closeRow();
    }

    if (!this.didaskaliaRowOpen) {
      result += `\n <div class="play-row didaskalia-row">\n`;
      result += `\n  <div class="didaskalia-text">\n`;
      this.rowOpen = true;
      this.didaskaliaRowOpen = true;
    }

    return result;
  }

  closeDidaskaliaRow(): string {
    if (!this.didaskaliaRowOpen) {
      return "";
    }
    return this.closeRow();
  }

  closeRow(): string {
    if (!this.rowOpen) {
      return "";
    }

    const closing = this.didaskaliaRowOpen ? `\n  </div>\n\n </div>\n` : `\n </div>\n\n </div>\n`;

    this.rowOpen = false;
    this.didaskaliaRowOpen = false;
    return closing;
  }
}

// =============================================================================
// XML Utilities
// =============================================================================

const extractInnerHTML = (el: Element, serializer: XmlSerializerLike): string => {
  let html = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    html += serializer.serializeToString(el.childNodes[i]);
  }
  return html;
};

const normalizeForDidaskaliaCheck = (html: string): string => {
  let s = html.replace(/<span class="character-highlighted"[^>]*>([^<]*)<\/span>/g, "$1");
  s = s.replace(/<(?!em|\/em)[^>]*>/g, "");
  return s;
};

const isDidaskaliaHTML = (html: string): boolean => {
  const s = normalizeForDidaskaliaCheck(html);
  const em = s.match(/<em>.*?<\/em>/gs)?.join("") || "";
  const outside = s.replace(/<em>.*?<\/em>/gs, "").trim();
  return em.length > 0 && (outside.length === 0 || em.length > outside.length * 2);
};

const findFirstTalkingCharacterSlug = (
  root: Element,
  characterMap: Map<string, unknown>,
): string | null => {
  const stack: Node[] = Array.from(root.childNodes);

  while (stack.length) {
    const n = stack.shift()!;
    if (isElementNode(n)) {
      const tag = n.tagName;
      const looksLikeChar = characterMap.has(tag) || isLikelyCharacterTag(tag);
      if (looksLikeChar && n.getAttribute("talking") === "true") return tag;
      for (let i = 0; i < n.childNodes.length; i++) stack.push(n.childNodes[i]);
    }
  }

  return null;
};

const normalizeParagraphWhitespace = (content: string): string => {
  let clean = content.replace(/\s+/g, " ").trim();
  clean = clean.replace(/\s*(<span class="character-talking"[^>]*><\/span>)\s*/g, "$1");
  return clean;
};

const serializeLowercaseChildren = (element: Element, serializer: XmlSerializerLike): string => {
  let html = "";
  for (const childNode of Array.from(element.childNodes)) {
    if (isElementNode(childNode) && startsWithUppercase(childNode.tagName)) {
      continue;
    }
    html += serializer.serializeToString(childNode);
  }
  return html;
};

const getFirstSignificantChild = (element: Element): Node | null => {
  for (const child of Array.from(element.childNodes)) {
    if (isTextNode(child)) {
      if ((child.textContent || "").trim().length === 0) {
        continue;
      }
      return child;
    }
    if (isElementNode(child)) {
      return child;
    }
  }
  return null;
};

const findFirstTalkingElement = (element: Element): Element | null => {
  for (const child of Array.from(element.childNodes)) {
    if (!isElementNode(child)) continue;

    if (child.getAttribute("talking") === "true") {
      return child;
    }

    if (child.tagName.toLowerCase() === "span") {
      const nested = findFirstTalkingElement(child);
      if (nested) return nested;
    }
  }
  return null;
};

const removeAllTalkingElementsWithin = (element: Element): void => {
  const toRemove: Element[] = [];
  const stack: Element[] = [element];
  while (stack.length) {
    const el = stack.pop()!;
    for (const child of Array.from(el.childNodes)) {
      if (isElementNode(child)) {
        if (child.getAttribute("talking") === "true") {
          toRemove.push(child);
        }
        stack.push(child);
      }
    }
  }
  for (const n of toRemove) {
    n.parentNode?.removeChild(n);
  }
};

const getPreviousSignificantElement = (node: Node | null): Element | null => {
  let current: Node | null = node;

  while (current) {
    if (isTextNode(current)) {
      if ((current.textContent || "").trim().length === 0) {
        current = current.previousSibling;
        continue;
      }
      return null;
    }

    if (isElementNode(current)) {
      return current;
    }

    current = current.previousSibling;
  }

  return null;
};

const removeLeadingWhitespaceTextNodes = (element: Element): void => {
  while (
    element.firstChild &&
    isTextNode(element.firstChild) &&
    ((element.firstChild.textContent || "").trim().length === 0 ||
      /^(\s|\u00A0)+$/.test(element.firstChild.textContent || ""))
  ) {
    element.removeChild(element.firstChild);
  }
};

const createTalkingLabelParagraph = (doc: Document, slug: string, displayName: string): Element => {
  const labelParagraph = doc.createElement("p");
  const talkingElement = doc.createElement(slug);
  talkingElement.setAttribute("talking", "true");
  labelParagraph.appendChild(talkingElement);
  const strong = doc.createElement("strong");
  strong.appendChild(doc.createTextNode(displayName));
  labelParagraph.appendChild(strong);
  labelParagraph.setAttribute("data-mixed-label", "true");
  labelParagraph.setAttribute("data-mixed-speaker", slug);
  return labelParagraph;
};

// =============================================================================
// Mixed Format Preprocessing
// =============================================================================

const preprocessMixedChapter = (
  chapter: Element,
  characterMap: Map<string, CharacterInfo>,
  doc: Document,
  serializer: XmlSerializerLike,
  // eslint-disable-next-line complexity
): void => {
  let current: Node | null = chapter.firstChild;

  while (current) {
    const nextSibling = current.nextSibling;

    if (isElementNode(current) && current.tagName.toLowerCase() === "p") {
      const paragraph = current;
      const firstTalkingElement = findFirstTalkingElement(paragraph);

      if (firstTalkingElement) {
        const slug = firstTalkingElement.tagName;
        const displayName = characterMap.get(slug)?.display || slug.replace(/-/g, " ");
        const previousElement = getPreviousSignificantElement(paragraph.previousSibling);
        let shouldInsertLabel = true;

        if (previousElement?.tagName.toLowerCase() === "p") {
          const previousSpeakerSlug =
            previousElement.getAttribute("data-mixed-linked-speaker") ||
            previousElement.getAttribute("data-mixed-speaker");
          if (previousSpeakerSlug === slug) {
            shouldInsertLabel = false;
          }
        }

        const parentEl = firstTalkingElement.parentNode as Element | null;
        let hasStrongLabelParent = false;
        if (parentEl && isElementNode(parentEl) && parentEl.tagName.toLowerCase() === "span") {
          hasStrongLabelParent = Array.from(parentEl.childNodes).some(
            (n) => isElementNode(n) && n.tagName.toLowerCase() === "strong",
          );
          if (hasStrongLabelParent) {
            shouldInsertLabel = false;
          }
        }

        if (shouldInsertLabel) {
          const labelParagraph = createTalkingLabelParagraph(doc, slug, displayName);
          chapter.insertBefore(labelParagraph, paragraph);
        }
        if (shouldInsertLabel || !hasStrongLabelParent) {
          removeAllTalkingElementsWithin(paragraph);
          removeLeadingWhitespaceTextNodes(paragraph);
        }
        paragraph.setAttribute("data-mixed-linked-speaker", slug);
      }
    }

    current = nextSibling;
  }

  const eligibleRun: Element[] = [];

  const flushEligibleRun = () => {
    if (eligibleRun.length === 1) {
      eligibleRun[0].setAttribute("data-mixed-narrator-break", "true");
    }
    eligibleRun.length = 0;
  };

  current = chapter.firstChild;

  while (current) {
    const nextSibling = current.nextSibling;

    if (isTextNode(current)) {
      if ((current.textContent || "").trim().length === 0) {
        current = nextSibling;
        continue;
      }
      flushEligibleRun();
      current = nextSibling;
      continue;
    }

    if (!isElementNode(current)) {
      flushEligibleRun();
      current = nextSibling;
      continue;
    }

    if (current.tagName.toLowerCase() !== "p") {
      flushEligibleRun();
      current = nextSibling;
      continue;
    }

    const paragraph = current;
    const startsWithTalking = Boolean(
      getFirstSignificantChild(paragraph) &&
      isElementNode(getFirstSignificantChild(paragraph)!) &&
      (getFirstSignificantChild(paragraph) as Element).getAttribute("talking") === "true",
    );
    const rawHtml = extractInnerHTML(paragraph, serializer);
    const isPureDidaskalia = isDidaskaliaHTML(rawHtml);
    const containsTalkingCharacter = Boolean(
      findFirstTalkingCharacterSlug(paragraph, characterMap),
    );

    if (paragraph.hasAttribute("data-mixed-linked-speaker")) {
      flushEligibleRun();
      current = nextSibling;
      continue;
    }

    if (!startsWithTalking && !isPureDidaskalia && !containsTalkingCharacter) {
      eligibleRun.push(paragraph);
    } else {
      flushEligibleRun();
    }

    current = nextSibling;
  }

  flushEligibleRun();
};

const preprocessMixedDocument = (
  xmlDoc: Document,
  characterMap: Map<string, CharacterInfo>,
  serializer: XmlSerializerLike,
): void => {
  const chapters = xmlDoc.getElementsByTagName("Chapter");
  for (const chapter of Array.from(chapters)) {
    preprocessMixedChapter(chapter, characterMap, xmlDoc, serializer);
  }
};

// =============================================================================
// Character Map Extraction
// =============================================================================

const buildCharacterMapFromBundles = (
  bundles: CharacterBundleInfo[],
  xmlDoc: Document,
): Map<string, CharacterInfo> => {
  const characterMap = new Map<string, CharacterInfo>();

  const bundleBySlug = new Map<string, CharacterBundleInfo>();
  for (const bundle of bundles) {
    bundleBySlug.set(bundle.slug.toLowerCase(), bundle);
  }

  const allEls = xmlDoc.getElementsByTagName("*");
  for (let i = 0; i < allEls.length; i++) {
    const tagName = allEls[i].tagName;
    if (isLikelyCharacterTag(tagName) && !characterMap.has(tagName)) {
      const bundle = bundleBySlug.get(tagName.toLowerCase());
      const display = bundle?.metadata.displayName ?? bundle?.name ?? tagName.replace(/-/g, " ");
      characterMap.set(tagName, { display });
    }
  }

  return characterMap;
};

// =============================================================================
// Paragraph Metadata & Rendering
// =============================================================================

type ParagraphMetadata = {
  rawHtml: string;
  isPureDidaskalia: boolean;
  firstSpeakerSlug: string | null;
};

const getParagraphMetadata = (
  chapter: Element,
  characterMap: Map<string, CharacterInfo>,
  serializer: XmlSerializerLike,
): ParagraphMetadata[] =>
  Array.from(chapter.childNodes)
    .filter(isElementNode)
    .filter((el) => el.tagName.toLowerCase() === "p")
    .map((paragraphElement) => ({
      rawHtml: extractInnerHTML(paragraphElement, serializer),
      isPureDidaskalia: isDidaskaliaHTML(extractInnerHTML(paragraphElement, serializer)),
      firstSpeakerSlug: findFirstTalkingCharacterSlug(paragraphElement, characterMap),
    }));

const renderParagraph = (
  paragraph: Element,
  metadata: ParagraphMetadata[],
  metadataIndex: number,
  state: {
    dataIndex: number;
    currentCharacterAlignment: "left" | "right";
    lastSpeakerSlug: string | null;
    playRowState: PlayRowState | null;
  },
  isPlayFormat: boolean,
  bookSlug: string,
  characterMap: Map<string, CharacterInfo>,
): {
  html: string;
  dataIndex: number;
  currentCharacterAlignment: "left" | "right";
  lastSpeakerSlug: string | null;
  // eslint-disable-next-line max-params, complexity -- play format renderer with many state variables
} => {
  const segments: string[] = [];
  let { dataIndex, currentCharacterAlignment, lastSpeakerSlug } = state;

  let forceNewRow = false;
  const info = metadata[metadataIndex];
  const speakerSlug = info?.firstSpeakerSlug || null;
  if (speakerSlug) {
    forceNewRow = true;
    if (lastSpeakerSlug === null) {
      currentCharacterAlignment = "left";
    } else if (speakerSlug !== lastSpeakerSlug) {
      currentCharacterAlignment = currentCharacterAlignment === "left" ? "right" : "left";
    }
    lastSpeakerSlug = speakerSlug;
  }

  const paragraphRender = renderParagraphContent(paragraph, {
    characterMap,
    isLikelyCharacterTag,
    bookSlug,
  });

  if (paragraphRender.hasTalkingCharacter) {
    forceNewRow = true;
  }

  const pContent = paragraphRender.content;
  if (!pContent.trim()) {
    return { html: "", dataIndex, currentCharacterAlignment, lastSpeakerSlug };
  }

  let clean = normalizeParagraphWhitespace(pContent);

  if (isPlayFormat && state.playRowState) {
    const { rawHtml, isPureDidaskalia } = info;

    let currentCharacterContinues = false;
    if (isPureDidaskalia && state.playRowState.isRowOpen()) {
      for (let nextIndex = metadataIndex + 1; nextIndex < metadata.length; nextIndex++) {
        const nextMeta = metadata[nextIndex];
        const nextSpeaker = nextMeta.firstSpeakerSlug;
        if (nextSpeaker && nextSpeaker !== lastSpeakerSlug) {
          break;
        }

        if (!nextMeta.isPureDidaskalia) {
          currentCharacterContinues = true;
          break;
        }
      }
    }

    const isDidaskaliaParagraph = isPureDidaskalia && !currentCharacterContinues;
    if (isDidaskaliaParagraph) {
      segments.push(state.playRowState.ensureDidaskaliaRow());
      segments.push(
        `\n    <p data-index="${dataIndex++}" data-is-didaskalia="true">\n      ${clean}\n    </p>`,
      );

      const nextMeta = metadata[metadataIndex + 1];
      if (!nextMeta || !nextMeta.isPureDidaskalia) {
        segments.push(state.playRowState.closeDidaskaliaRow());
      }

      return { html: segments.join(""), dataIndex, currentCharacterAlignment, lastSpeakerSlug };
    }

    const characterPlaceholderSpans: string[] = [];
    clean = clean.replace(/<span class="character-placeholder[^>]*>.*?<\/span>/g, (match) => {
      characterPlaceholderSpans.push(match);
      return "";
    });
    const isSoloNarrationBreak = paragraph.getAttribute("data-mixed-narrator-break") === "true";

    if (isSoloNarrationBreak) {
      segments.push(state.playRowState.ensureDidaskaliaRow());
      segments.push(
        `\n    <p data-index="${dataIndex++}" data-is-didaskalia="true">\n      ${clean}\n    </p>`,
      );
      segments.push(state.playRowState.closeDidaskaliaRow());
      return { html: segments.join(""), dataIndex, currentCharacterAlignment, lastSpeakerSlug };
    }

    const hasAvatar = characterPlaceholderSpans.length > 0;
    const isMixedLabelParagraph = paragraph.getAttribute("data-mixed-label") === "true";

    if (!state.playRowState.isRowOpen() || forceNewRow) {
      segments.push(
        state.playRowState.openCharacterRow(
          currentCharacterAlignment,
          hasAvatar,
          characterPlaceholderSpans.join(""),
        ),
      );
    }

    const wrappedByEm = /^<em[\s>][\s\S]*<\/em>$/.test(rawHtml.trim());
    const hasDidaskaliaInDialogue = wrappedByEm || (isPureDidaskalia && currentCharacterContinues);

    const isCharacterParagraph = speakerSlug !== null;

    const dataIndexAttribute = isMixedLabelParagraph ? "" : `\n  data-index="${dataIndex++}"`;
    segments.push(`\n    <p${dataIndexAttribute}
  data-text-alignment="${currentCharacterAlignment}"
  data-is-character="${isCharacterParagraph ? "true" : "false"}"
  data-is-didaskalia="${hasDidaskaliaInDialogue ? "true" : "false"}"
>\n      ${clean}\n    </p>`);

    return { html: segments.join(""), dataIndex, currentCharacterAlignment, lastSpeakerSlug };
  }

  segments.push(`\n <p data-index="${dataIndex++}">\n ${clean}\n </p>`);
  return { html: segments.join(""), dataIndex, currentCharacterAlignment, lastSpeakerSlug };
};

// =============================================================================
// Chapter Rendering
// =============================================================================

export const getChapterTitle = (chapter: Element): string => {
  let currentAct = "";
  const actElements =
    chapter.getElementsByTagName("h3").length > 0
      ? chapter.getElementsByTagName("h3")
      : chapter.getElementsByTagName("Act");
  const titleElements =
    chapter.getElementsByTagName("h4").length > 0
      ? chapter.getElementsByTagName("h4")
      : chapter.getElementsByTagName("Title");
  const subtitleElements =
    chapter.getElementsByTagName("h5").length > 0
      ? chapter.getElementsByTagName("h5")
      : chapter.getElementsByTagName("Subtitle");

  if (actElements.length > 0) {
    currentAct = getTitleText(actElements[0]);
  }

  const titleText = getTitleText(titleElements[0]);
  const subtitleText = getTitleText(subtitleElements[0]);

  const chapterTitle = [
    currentAct,
    titleText && subtitleText ? titleText.replace(/\.$/, "") : titleText,
    subtitleText,
  ]
    .filter(Boolean)
    .join(", ");

  return chapterTitle;
};

const getChapterTitles = (
  chapters: HTMLCollectionOf<Element>,
): Array<{ id: string; title: string }> => {
  const chapterTitles: Array<{ id: string; title: string }> = [];

  for (const chapter of Array.from(chapters)) {
    const chapterId = chapter.getAttribute("id");
    if (!chapterId || chapterId === "null") {
      continue;
    }
    chapterTitles.push({ id: chapterId, title: getChapterTitle(chapter) });
  }

  return chapterTitles;
};

/**
 * Extract the speaker label from a paragraph that starts with a talking character.
 * Returns the text content of the <strong> tag if present, or the character display name.
 */
const extractSpeakerLabel = (
  paragraph: Element,
  characterMap: Map<string, CharacterInfo>,
): string | null => {
  // Look for <strong> tag which contains the speaker label (e.g., "THESEUS", "LORD THESEUS")
  const strongElements = paragraph.getElementsByTagName("strong");
  if (strongElements.length > 0) {
    return (strongElements[0].textContent || "").trim();
  }

  // Fallback to character display name
  const talkingElement = findFirstTalkingElement(paragraph);
  if (talkingElement) {
    const slug = talkingElement.tagName;
    const charInfo = characterMap.get(slug);
    return charInfo?.display ?? slug.replace(/-/g, " ");
  }

  return null;
};

/**
 * Render a chapter in Format B (compact storage format).
 *
 * Format B structure:
 * - Speaker blocks: <div data-speaker="slug" data-label="LABEL">paragraphs</div>
 * - Stage directions: <p data-is-didaskalia="true">content</p>
 * - Headings: <h3>/<h4>/<h5> with data-act where applicable
 */
const renderChapterFormatB = (
  chapter: Element,
  characterMap: Map<string, CharacterInfo>,
  bookSlug: string,
  serializer: XmlSerializerLike,
): string => {
  const formatB = new FormatBState();
  const outputParts: string[] = [];

  for (const node of Array.from(chapter.childNodes)) {
    if (!isElementNode(node)) continue;

    const tagName = node.tagName.toLowerCase();

    switch (tagName) {
      case "h3":
      case "act":
        formatB.flush();
        outputParts.push(formatB.getOutput());
        outputParts.push(`<h3 data-act="true">${node.textContent || ""}</h3>`);
        break;

      case "h4":
      case "title":
        formatB.flush();
        outputParts.push(formatB.getOutput());
        outputParts.push(`<h4>${node.textContent || ""}</h4>`);
        break;

      case "h5":
      case "subtitle":
        formatB.flush();
        outputParts.push(formatB.getOutput());
        outputParts.push(`<h5>${node.textContent || ""}</h5>`);
        break;

      case "p": {
        const rawHtml = extractInnerHTML(node, serializer);
        const isPureDidaskalia = isDidaskaliaHTML(rawHtml);
        const talkingSlug = findFirstTalkingCharacterSlug(node, characterMap);

        // Render paragraph content
        const paragraphRender = renderParagraphContent(node, {
          characterMap,
          isLikelyCharacterTag,
          bookSlug,
        });

        const content = normalizeParagraphWhitespace(paragraphRender.content);
        if (!content.trim()) break;

        // Remove character placeholder spans from content (Format B doesn't need them)
        const cleanContent = content
          .replace(/<span class="character-placeholder[^>]*>.*?<\/span>/g, "")
          .trim();

        if (talkingSlug) {
          // This is a speaker label paragraph - start new speaker block
          const label = extractSpeakerLabel(node, characterMap);
          // Find the talking element to get enters/exits attributes
          const talkingEl = findFirstTalkingElement(node);
          const enters = talkingEl?.getAttribute("enters") === "true";
          const exits = talkingEl?.getAttribute("exits") === "true";
          formatB.setSpeaker(talkingSlug.toLowerCase(), label || talkingSlug, enters, exits);
          // Don't add the label paragraph itself - it's stored in data-label
        } else if (isPureDidaskalia) {
          // Stage direction
          formatB.addDidaskalia(cleanContent);
        } else {
          // Content paragraph - add to current speaker block
          formatB.addParagraph(cleanContent);
        }
        break;
      }

      default: {
        // Other elements pass through
        formatB.flush();
        outputParts.push(formatB.getOutput());
        const serializedInner = serializeLowercaseChildren(node, serializer);
        outputParts.push(`<${tagName}>${serializedInner}</${tagName}>`);
      }
    }
  }

  // Flush any remaining speaker block
  formatB.flush();
  outputParts.push(formatB.getOutput());

  const innerHtml = outputParts.filter(Boolean).join("\n");
  return `<section data-chapter="${chapter.getAttribute("id")}">\n${innerHtml}\n</section>`;
};

const renderChapter = (
  chapter: Element,
  characterMap: Map<string, CharacterInfo>,
  isPlayFormat: boolean,
  bookSlug: string,
  serializer: XmlSerializerLike,
): string => {
  // Use Format B for play formats
  if (isPlayFormat) {
    return renderChapterFormatB(chapter, characterMap, bookSlug, serializer);
  }

  // Legacy rendering for non-play formats
  let currentCharacterAlignment: "left" | "right" = "left";
  let lastSpeakerSlug: string | null = null;

  const playRowState = new PlayRowState();

  const paragraphMetadata = getParagraphMetadata(chapter, characterMap, serializer);

  let htmlResult = `\n      <section><section data-chapter="${chapter.getAttribute("id")}">`;
  let dataIndex = 0;

  let paragraphMetaIndex = 0;

  const htmlResults = Array.from(chapter.childNodes)
    .filter(isElementNode)
    .map((childElement) => {
      const tagName = childElement.tagName;

      switch (tagName.toLowerCase()) {
        case "p": {
          const paragraphResult = renderParagraph(
            childElement,
            paragraphMetadata,
            paragraphMetaIndex,
            { dataIndex, currentCharacterAlignment, lastSpeakerSlug, playRowState },
            false, // Not play format - use legacy renderer
            bookSlug,
            characterMap,
          );
          paragraphMetaIndex++;

          dataIndex = paragraphResult.dataIndex;
          currentCharacterAlignment = paragraphResult.currentCharacterAlignment;
          lastSpeakerSlug = paragraphResult.lastSpeakerSlug;
          return paragraphResult.html;
        }
        case "h3":
        case "act":
          return `\n    <h3 data-index="${dataIndex++}" data-act="true">${childElement.textContent || ""}</h3>`;
        case "h4":
        case "title":
          return `\n    <h4 data-index="${dataIndex++}">${childElement.textContent || ""}</h4>`;
        case "h5":
        case "subtitle":
          return `\n    <h5 data-index="${dataIndex++}">${childElement.textContent || ""}</h5>`;
        default: {
          const serializedInner = serializeLowercaseChildren(childElement, serializer);
          return `\n    <${tagName} data-index="${dataIndex++}">${serializedInner}</${tagName}>`;
        }
      }
    });

  htmlResult += htmlResults.join("");
  htmlResult += playRowState.closeRow();

  htmlResult += "\n  </section></section>";
  return htmlResult;
};

const ensureProperPolishTextBreaking = (html: string): string => {
  const conjunctions =
    "a|i|o|u|w|z|na|do|od|za|po|we|ku|ze|co|że|bo|iż|ni|nad|pod|bez|dla|oraz|ale|lub|czy|ani";
  const conjunctionsRegex = new RegExp(`(?<=\\s|&nbsp;)(${conjunctions})\\s`, "gi");

  return html.replace(/>([^<]+)</g, (_match, textContent) => {
    const formattedText = textContent.replace(conjunctionsRegex, "$1&nbsp;");
    return `>${formattedText}<`;
  });
};

// =============================================================================
// Public Exports
// =============================================================================

const normalizeBookForm = (bookForm: string): string => bookForm.toLowerCase();

const normalizeBookLang = (bookLang: string): string => bookLang.toLowerCase();

export const renderBookFromXmlDocument = (
  xmlDoc: Document,
  options: RenderOptions,
): RenderBookResult => {
  const { bookSlug, bookLang, bookForm, characterBundles, serializer } = options;

  const characterMap = buildCharacterMapFromBundles(characterBundles, xmlDoc);

  const bookFormValue = normalizeBookForm(bookForm);
  const bookLangValue = normalizeBookLang(bookLang);

  if (bookFormValue === "mixed") {
    preprocessMixedDocument(xmlDoc, characterMap, serializer);
  }

  const isPlayFormat = bookFormValue === "play" || bookFormValue === "mixed";

  let htmlResult = "";

  if (bookFormValue === "play") {
    htmlResult += `\n    <div class="play-container">`;
  } else if (bookFormValue === "mixed") {
    htmlResult += `\n    <div class="play-container mixed-container">`;
  }

  const chapters = xmlDoc.getElementsByTagName("Chapter");

  for (const chapter of Array.from(chapters)) {
    const chapterId = chapter.getAttribute("id");
    if (!chapterId || chapterId === "null") {
      console.warn("[xmlRendererCore] Skipping chapter with invalid id:", chapterId);
      continue;
    }
    htmlResult += renderChapter(chapter, characterMap, isPlayFormat, bookSlug, serializer);
  }

  if (isPlayFormat) {
    htmlResult += `\n    </div>`;
  }

  if (bookLangValue === "polish" && !isPlayFormat) {
    htmlResult = ensureProperPolishTextBreaking(htmlResult);
  }

  htmlResult = wrapPunctuationAdvanced(htmlResult);

  const wrappedHtml = `<section>${htmlResult.trim()}</section>`;

  return { htmlResult: wrappedHtml, chapterTitles: getChapterTitles(chapters) };
};

export const renderChapterFromXmlDocument = (
  xmlDoc: Document,
  options: RenderOptions,
): RenderChapterResult => {
  const { bookSlug, bookLang, bookForm, characterBundles, serializer } = options;

  const characterMap = buildCharacterMapFromBundles(characterBundles, xmlDoc);

  const bookFormValue = normalizeBookForm(bookForm);
  const bookLangValue = normalizeBookLang(bookLang);

  if (bookFormValue === "mixed") {
    preprocessMixedDocument(xmlDoc, characterMap, serializer);
  }

  const isPlayFormat = bookFormValue === "play" || bookFormValue === "mixed";

  const chapter = xmlDoc.getElementsByTagName("Chapter")[0];
  if (!chapter) {
    throw new Error("[xmlRendererCore] No Chapter element found in XML");
  }

  let html = renderChapter(chapter, characterMap, isPlayFormat, bookSlug, serializer);

  if (bookLangValue === "polish" && !isPlayFormat) {
    html = ensureProperPolishTextBreaking(html);
  }

  html = wrapPunctuationAdvanced(html);

  return { html, title: getChapterTitle(chapter), chapterId: chapter.getAttribute("id") || "" };
};
