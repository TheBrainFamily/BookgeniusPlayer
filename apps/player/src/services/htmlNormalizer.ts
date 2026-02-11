import { getFigureUrl } from "@player/utils/assetUrls";
import { forEachIndexedMixedFormatLeaf } from "./mixedFormatLeafIndexing";

const BLOCKED_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "link",
  "meta",
  "base",
  "noscript",
]);

const INLINE_SPEAKER_HOIST_THRESHOLD = 50;
const INLINE_SPEAKER_LINE_CLASS = "inline-speaker-line";
const INLINE_SPEAKER_LINE_SPEAKER_CLASS = "inline-speaker-line--speaker";
const INLINE_SPEAKER_LINE_NARRATION_CLASS = "inline-speaker-line--narration";

type InlineSpeakerSegment = {
  kind: "speaker" | "narration";
  speaker: string | null;
  fragment: DocumentFragment;
};

export function sanitizeHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  for (const tag of BLOCKED_TAGS) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }

  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      if (name.startsWith("on") || value.includes("javascript:") || value.includes("vbscript:")) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return doc.body.innerHTML;
}

function isDramaDialogue(element: Element): boolean {
  return (
    element.tagName.toLowerCase() === "div" &&
    element.querySelector("[data-speaker-label]") !== null
  );
}

/**
 * Check if element is a Format B speaker block:
 * <div data-speaker="..." data-label="...">
 */
function isFormatBSpeakerBlock(element: Element): boolean {
  return (
    element.tagName.toLowerCase() === "div" &&
    element.hasAttribute("data-speaker") &&
    element.hasAttribute("data-label")
  );
}

function processPlayContainer(
  container: Element,
  doc: Document,
  state: { lastSpeaker: string | null; alignment: "left" | "right" },
): void {
  const children = Array.from(container.children);

  for (const child of children) {
    const tagName = child.tagName.toLowerCase();

    if (tagName === "section" && !child.hasAttribute("data-chapter")) {
      processPlayContainer(child, doc, state);
      continue;
    }

    if (child.hasAttribute("data-speaker") && isDramaDialogue(child)) {
      const speakers = child.getAttribute("data-speaker") || "";
      const firstSpeaker = speakers.split(/\s+/)[0];

      if (firstSpeaker && firstSpeaker !== state.lastSpeaker) {
        state.alignment =
          state.lastSpeaker === null ? "left" : state.alignment === "left" ? "right" : "left";
        state.lastSpeaker = firstSpeaker;
      }

      const playRow = doc.createElement("div");
      playRow.className = "play-row";
      playRow.setAttribute("data-text-alignment", state.alignment);

      const characterAvatar = doc.createElement("div");
      characterAvatar.className = "character-avatar";
      characterAvatar.setAttribute("data-speaker", speakers);

      const characterText = doc.createElement("div");
      characterText.className = "character-text";

      for (const innerChild of Array.from(child.children)) {
        if (innerChild.hasAttribute("data-speaker-label")) {
          continue;
        }
        const p = innerChild.cloneNode(true) as Element;
        p.setAttribute("data-text-alignment", state.alignment);
        p.setAttribute("data-is-character", "true");
        characterText.appendChild(p);
      }

      playRow.appendChild(characterAvatar);
      playRow.appendChild(characterText);
      container.replaceChild(playRow, child);
    } else if (tagName === "p" && child.hasAttribute("data-stage-direction")) {
      const playRow = doc.createElement("div");
      playRow.className = "play-row didaskalia-row";

      const didaskaliaText = doc.createElement("div");
      didaskaliaText.className = "didaskalia-text";

      const p = child.cloneNode(true) as Element;
      p.setAttribute("data-is-didaskalia", "true");
      didaskaliaText.appendChild(p);

      playRow.appendChild(didaskaliaText);
      container.replaceChild(playRow, child);
    }
  }
}

export function wrapPlayElements(section: Element, doc: Document): void {
  const state = { lastSpeaker: null as string | null, alignment: "left" as "left" | "right" };
  processPlayContainer(section, doc, state);
}

/**
 * Transform Format B input into play-row structure.
 *
 * Format B:
 *   <div data-speaker="bob" data-label="BOB"><p>Line 1</p><p>Line 2</p></div>
 *
 * Becomes:
 *   <div class="play-row" data-speaker="bob" data-text-alignment="left">
 *     <div class="character-avatar"></div>
 *     <div class="character-text">
 *       <p data-is-character="true"><strong>BOB</strong></p>
 *       <p>Line 1</p>
 *       <p>Line 2</p>
 *     </div>
 *   </div>
 */
function transformFormatBToPlayRows(section: Element, doc: Document): void {
  const state = { lastSpeaker: null as string | null, alignment: "left" as "left" | "right" };
  const children = Array.from(section.children);

  for (const child of children) {
    const tagName = child.tagName.toLowerCase();

    // Handle Format B speaker blocks
    if (isFormatBSpeakerBlock(child)) {
      const speakers = child.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean) ?? [];
      const label = child.getAttribute("data-label") || "";
      const firstSpeaker = speakers[0] || "";

      // Update alignment based on speaker change
      if (firstSpeaker && firstSpeaker !== state.lastSpeaker) {
        state.alignment =
          state.lastSpeaker === null ? "left" : state.alignment === "left" ? "right" : "left";
        state.lastSpeaker = firstSpeaker;
      }

      // Create play-row structure
      const playRow = doc.createElement("div");
      playRow.className = "play-row";
      playRow.setAttribute("data-text-alignment", state.alignment);
      playRow.setAttribute("data-speaker", speakers.join(" "));

      const characterAvatar = doc.createElement("div");
      characterAvatar.className = "character-avatar";

      const characterText = doc.createElement("div");
      characterText.className = "character-text";

      // Create label paragraph
      const labelP = doc.createElement("p");
      labelP.setAttribute("data-text-alignment", state.alignment);
      labelP.setAttribute("data-is-character", "true");
      labelP.setAttribute("data-is-didaskalia", "false");
      const strong = doc.createElement("strong");
      strong.textContent = label;
      labelP.appendChild(strong);
      characterText.appendChild(labelP);

      // Move content paragraphs
      for (const innerChild of Array.from(child.children)) {
        const isExplicitDidaskalia = innerChild.getAttribute("data-is-didaskalia") === "true";
        const isPureEm =
          innerChild.tagName.toLowerCase() === "p" ? isPureEmParagraph(innerChild) : false;
        const isDidaskalia = isExplicitDidaskalia || isPureEm;
        const p = innerChild.cloneNode(true) as Element;
        p.setAttribute("data-text-alignment", state.alignment);
        p.setAttribute("data-is-character", "false");
        p.setAttribute("data-is-didaskalia", isDidaskalia ? "true" : "false");
        characterText.appendChild(p);
      }

      playRow.appendChild(characterAvatar);
      playRow.appendChild(characterText);
      section.replaceChild(playRow, child);
      continue;
    }

    // Handle didaskalia paragraphs (explicit data-is-didaskalia or pure em)
    if (tagName === "p") {
      const isExplicitDidaskalia = child.getAttribute("data-is-didaskalia") === "true";
      const isPureEm = isPureEmParagraph(child);

      if (isExplicitDidaskalia || isPureEm) {
        const playRow = doc.createElement("div");
        playRow.className = "play-row didaskalia-row";

        const didaskaliaText = doc.createElement("div");
        didaskaliaText.className = "didaskalia-text";

        const p = child.cloneNode(true) as Element;
        p.setAttribute("data-is-didaskalia", "true");
        didaskaliaText.appendChild(p);

        playRow.appendChild(didaskaliaText);
        section.replaceChild(playRow, child);
      }
    }
  }
}

function indexPlayRowParagraphs(playRow: Element, startIndex: number): number {
  let index = startIndex;
  playRow.querySelectorAll(".character-text p, .didaskalia-text p").forEach((p) => {
    p.setAttribute("data-index", String(index++));
  });
  return index;
}

export function indexMixedFormatChildren(section: Element): void {
  let index = 0;
  for (const child of Array.from(section.children)) {
    const tagName = child.tagName.toLowerCase();

    if (child.classList.contains("play-row")) {
      index = indexPlayRowParagraphs(child, index);
    } else if (tagName === "section" && !child.hasAttribute("data-chapter")) {
      for (const nestedChild of Array.from(child.children)) {
        if (nestedChild.classList.contains("play-row")) {
          index = indexPlayRowParagraphs(nestedChild, index);
        } else {
          nestedChild.setAttribute("data-index", String(index++));
        }
      }
    } else {
      child.setAttribute("data-index", String(index++));
    }
  }
}

export function indexMixedFormatLeaves(section: Element): void {
  let index = 0;

  for (const child of Array.from(section.children)) {
    if (child.classList.contains("play-row")) {
      index = indexPlayRowParagraphs(child, index);
    } else {
      index = forEachIndexedMixedFormatLeaf(
        [child],
        {
          getTagName: (element) => element.tagName,
          getTextContent: (element) => element.textContent,
          getChildren: (element) => Array.from(element.children),
        },
        (leafElement, dataIndex) => {
          leafElement.setAttribute("data-index", String(dataIndex));
        },
        index,
      );
    }
  }
}

function indexPurePlayFormat(section: Element): void {
  let index = 0;
  const indexables = section.querySelectorAll("h2, h3, h4, h5, .play-row");
  for (const el of Array.from(indexables)) {
    if (el.classList.contains("play-row")) {
      index = indexPlayRowParagraphs(el, index);
    } else {
      el.setAttribute("data-index", String(index++));
    }
  }
}

export function injectDataIndex(section: Element): void {
  const chapterFormat = section.getAttribute("data-chapter-format");
  const hasPlayRows = section.querySelector(".play-row") !== null;
  const isMixedOrProse = chapterFormat === "mixed" || !hasPlayRows;

  if (isMixedOrProse) {
    indexMixedFormatLeaves(section);
  } else {
    indexPurePlayFormat(section);
  }
}

function normalizeWhitespaceForVisibility(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeSpeakerAttr(speakerAttr: string | null): string | null {
  if (!speakerAttr) return null;
  const normalized = speakerAttr.split(/\s+/).filter(Boolean).join(" ");
  return normalized.length > 0 ? normalized : null;
}

function hasVisibleSegmentContent(segment: InlineSpeakerSegment): boolean {
  return normalizeWhitespaceForVisibility(segment.fragment.textContent ?? "").length > 0;
}

function cloneBetweenNodes(
  block: Element,
  doc: Document,
  startAfter: Node | null,
  endBefore: Node | null,
): DocumentFragment {
  const range = doc.createRange();
  if (startAfter) {
    range.setStartAfter(startAfter);
  } else {
    range.setStart(block, 0);
  }
  if (endBefore) {
    range.setEndBefore(endBefore);
  } else {
    range.setEnd(block, block.childNodes.length);
  }
  return range.cloneContents();
}

function cloneNodeChildren(node: Node, doc: Document): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  for (const child of Array.from(node.childNodes)) {
    fragment.appendChild(child.cloneNode(true));
  }
  return fragment;
}

function getTopLevelInlineSpeakerSpans(block: Element): HTMLSpanElement[] {
  return Array.from(block.querySelectorAll<HTMLSpanElement>("span[data-speaker]")).filter(
    (span) => {
      if (span.closest(`.${INLINE_SPEAKER_LINE_CLASS}`)) return false;
      if (span.closest("p, blockquote") !== block) return false;
      return span.parentElement?.closest("span[data-speaker]") === null;
    },
  );
}

function getVisibleTextOffsetBeforeNode(block: Element, doc: Document, node: Node): number {
  const range = doc.createRange();
  range.setStart(block, 0);
  range.setEndBefore(node);
  return normalizeWhitespaceForVisibility(range.toString()).length;
}

function compactInlineSpeakerSegments(segments: InlineSpeakerSegment[]): InlineSpeakerSegment[] {
  const compacted: InlineSpeakerSegment[] = [];

  for (const segment of segments) {
    if (!hasVisibleSegmentContent(segment)) continue;

    const previous = compacted[compacted.length - 1];
    const sameKind = previous && previous.kind === segment.kind;
    const sameSpeaker =
      sameKind && segment.kind === "narration" ? true : previous?.speaker === segment.speaker;

    if (previous && sameKind && sameSpeaker) {
      previous.fragment.append(segment.fragment);
      continue;
    }

    compacted.push(segment);
  }

  return compacted;
}

/** Walk a node tree depth-first and return the first Text node with non-whitespace content. */
function findFirstTextNode(node: Node): Text | null {
  if (node.nodeType === 3 /* Node.TEXT_NODE */ && node.textContent?.trim()) {
    return node as Text;
  }
  for (const child of Array.from(node.childNodes)) {
    const found = findFirstTextNode(child);
    if (found) return found;
  }
  return null;
}

const HAIR_SPACE = "\u200A";

/**
 * Walk the section DOM and restore hair-space between nested opening quotes.
 *
 * Standard Ebooks uses `&hairsp;` between `"` and `'` so the quote marks
 * are visually distinct without a full word-space.  The pipeline's speaker
 * annotation can replace that with a regular space.
 *
 * Finds text nodes ending with an opening quote + whitespace where the next
 * visible content starts with an opening quote, and collapses to hair-space.
 */
function restoreNestedQuoteSpacing(section: Element): void {
  const ownerDoc = section.ownerDocument ?? document;
  const walker = ownerDoc.createTreeWalker(section, 0x4 /* NodeFilter.SHOW_TEXT */);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (!node.textContent) continue;
    // Text node ends with opening quote + whitespace
    if (/[\u201C\u2018"']\s+$/.test(node.textContent)) {
      const nextText = findFirstTextNodeAfter(node, section);
      if (nextText?.textContent && /^[\u201C\u2018"']/.test(nextText.textContent)) {
        node.textContent = node.textContent.replace(/\s+$/, HAIR_SPACE);
      }
    }
  }
}

/** Starting from `node`, find the first text node with content that follows it in document order. */
function findFirstTextNodeAfter(node: Node, root: Element): Text | null {
  const ownerDoc = root.ownerDocument ?? document;
  const walker = ownerDoc.createTreeWalker(root, 0x4 /* NodeFilter.SHOW_TEXT */);
  walker.currentNode = node;
  let next: Text | null;
  while ((next = walker.nextNode() as Text | null)) {
    if (next.textContent?.trim()) return next;
  }
  return null;
}

/**
 * When a segment starts with orphaned punctuation (e.g., ". She did not…"),
 * move that punctuation to the tail of the preceding segment so the avatar
 * line doesn't open with a stray period or comma.
 */
function shiftLeadingPunctuation(
  segments: InlineSpeakerSegment[],
  doc: Document,
): InlineSpeakerSegment[] {
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];

    const firstText = findFirstTextNode(curr.fragment);
    if (!firstText?.textContent) continue;

    const match = firstText.textContent.match(/^([.,;!?)+\u2014\u2026]+\s?)/);
    if (!match) continue;

    const punctuation = match[1];
    firstText.textContent = firstText.textContent.slice(punctuation.length);
    if (!firstText.textContent) firstText.remove();

    prev.fragment.append(doc.createTextNode(punctuation));
  }

  return segments;
}

/**
 * When a short narration segment (e.g., "said she,") sits between two speaker
 * segments for the same character, absorb all three into one speaker segment.
 * This prevents the same character from getting a second avatar line.
 */
function absorbNarrationBridges(segments: InlineSpeakerSegment[]): InlineSpeakerSegment[] {
  if (segments.length < 3) return segments;

  const result: InlineSpeakerSegment[] = [];
  let i = 0;

  while (i < segments.length) {
    const curr = segments[i];
    const mid = segments[i + 1];
    const next = segments[i + 2];

    if (
      curr.kind === "speaker" &&
      mid?.kind === "narration" &&
      next?.kind === "speaker" &&
      curr.speaker !== null &&
      curr.speaker === next.speaker &&
      normalizeWhitespaceForVisibility(mid.fragment.textContent ?? "").length <
        INLINE_SPEAKER_HOIST_THRESHOLD
    ) {
      curr.fragment.append(mid.fragment, next.fragment);
      result.push(curr);
      i += 3;
    } else {
      result.push(curr);
      i += 1;
    }
  }

  return result;
}

function hoistLeadingNarrationIntoFirstSpeaker(
  segments: InlineSpeakerSegment[],
  doc: Document,
): InlineSpeakerSegment[] {
  const firstSpeakerIndex = segments.findIndex((segment) => segment.kind === "speaker");
  if (firstSpeakerIndex <= 0) return segments;

  const leadingNarration = segments.slice(0, firstSpeakerIndex);
  if (leadingNarration.some((segment) => segment.kind !== "narration")) {
    return segments;
  }

  const mergedFragment = doc.createDocumentFragment();
  for (const segment of leadingNarration) {
    mergedFragment.append(segment.fragment);
  }
  mergedFragment.append(segments[firstSpeakerIndex].fragment);
  segments[firstSpeakerIndex].fragment = mergedFragment;

  return segments.slice(firstSpeakerIndex);
}

function buildInlineSpeakerSegments(
  block: Element,
  doc: Document,
  inlineSpeakerSpans: HTMLSpanElement[],
  parentSpeaker: string | null,
): InlineSpeakerSegment[] {
  const segments: InlineSpeakerSegment[] = [];
  let previousInlineSpeakerSpan: Node | null = null;

  for (const inlineSpeakerSpan of inlineSpeakerSpans) {
    const beforeFragment = cloneBetweenNodes(
      block,
      doc,
      previousInlineSpeakerSpan,
      inlineSpeakerSpan,
    );
    segments.push({
      kind: parentSpeaker ? "speaker" : "narration",
      speaker: parentSpeaker,
      fragment: beforeFragment,
    });

    const inlineSpeaker = normalizeSpeakerAttr(inlineSpeakerSpan.getAttribute("data-speaker"));
    const inlineSpeakerFragment = cloneNodeChildren(inlineSpeakerSpan, doc);
    segments.push({
      kind: inlineSpeaker ? "speaker" : parentSpeaker ? "speaker" : "narration",
      speaker: inlineSpeaker ?? parentSpeaker,
      fragment: inlineSpeakerFragment,
    });

    previousInlineSpeakerSpan = inlineSpeakerSpan;
  }

  const trailingFragment = cloneBetweenNodes(block, doc, previousInlineSpeakerSpan, null);
  segments.push({
    kind: parentSpeaker ? "speaker" : "narration",
    speaker: parentSpeaker,
    fragment: trailingFragment,
  });

  return segments;
}

function shouldSkipInlineSpeakerSegmentation(block: Element): boolean {
  if (block.closest(".play-row")) return true;
  if (block.closest("table[data-drama]")) return true;
  if (block.closest('[data-epub-type~="z3998:verse"], [epub\\:type~="z3998:verse"]')) return true;
  return block.querySelector(`:scope > .${INLINE_SPEAKER_LINE_CLASS}`) !== null;
}

function renderInlineSpeakerSegments(
  block: Element,
  doc: Document,
  segments: InlineSpeakerSegment[],
): void {
  block.replaceChildren();

  for (const segment of segments) {
    const lineElement = doc.createElement("span");
    lineElement.classList.add(INLINE_SPEAKER_LINE_CLASS);

    if (segment.kind === "speaker" && segment.speaker !== null) {
      lineElement.classList.add(INLINE_SPEAKER_LINE_SPEAKER_CLASS);
      lineElement.setAttribute("data-speaker", segment.speaker);
    } else {
      lineElement.classList.add(INLINE_SPEAKER_LINE_NARRATION_CLASS);
    }

    lineElement.append(segment.fragment);
    block.appendChild(lineElement);
  }
}

export function preprocessInlineSpeakerSpans(section: Element, doc: Document): void {
  const blocks = Array.from(section.querySelectorAll("p, blockquote"));

  for (const block of blocks) {
    if (shouldSkipInlineSpeakerSegmentation(block)) continue;

    const inlineSpeakerSpans = getTopLevelInlineSpeakerSpans(block);
    if (inlineSpeakerSpans.length === 0) continue;

    const parentSpeaker = normalizeSpeakerAttr(block.getAttribute("data-speaker"));
    const firstSpeakerOffset = getVisibleTextOffsetBeforeNode(block, doc, inlineSpeakerSpans[0]);

    let segments = buildInlineSpeakerSegments(block, doc, inlineSpeakerSpans, parentSpeaker);
    segments = compactInlineSpeakerSegments(segments);
    segments = absorbNarrationBridges(segments);

    const shouldHoistFirstSpeaker =
      !parentSpeaker && firstSpeakerOffset < INLINE_SPEAKER_HOIST_THRESHOLD;
    if (shouldHoistFirstSpeaker) {
      segments = hoistLeadingNarrationIntoFirstSpeaker(segments, doc);
      segments = compactInlineSpeakerSegments(segments);
      segments = absorbNarrationBridges(segments);
    }

    segments = shiftLeadingPunctuation(segments, doc);

    if (segments.length === 0) continue;

    renderInlineSpeakerSegments(block, doc, segments);
    block.removeAttribute("data-speaker");
  }

  restoreNestedQuoteSpacing(section);
}

export function injectAvatarShells(section: Element, doc: Document): void {
  const createAvatarShell = (speaker: string, isNested: boolean = false): HTMLSpanElement => {
    const shell = doc.createElement("span");
    shell.className = isNested
      ? "character-placeholder character-talking mid-sentence-speaker"
      : "character-placeholder character-talking start-of-paragraph";
    shell.setAttribute("data-character", speaker);
    shell.setAttribute("data-is-talking", "true");
    return shell;
  };

  const letterSelector =
    'blockquote[data-epub-type~="z3998:letter"], blockquote[epub\\:type~="z3998:letter"]';
  const letterBlockquotes = Array.from(section.querySelectorAll(letterSelector));
  const processedLetterBlockquotes = new WeakSet<Element>();

  for (const letterBlockquote of letterBlockquotes) {
    if (letterBlockquote.querySelector(`.${INLINE_SPEAKER_LINE_CLASS}`)) {
      continue;
    }

    processedLetterBlockquotes.add(letterBlockquote);

    const blockquoteSpeaker = letterBlockquote
      .getAttribute("data-speaker")
      ?.split(/\s+/)
      .filter(Boolean)[0];

    const speakerCounts = new Map<string, number>();
    let totalSpeakerOccurrences = 0;

    // Include the letter block's own speaker so single-speaker letters
    // (with no nested [data-speaker]) still get a top avatar shell.
    if (blockquoteSpeaker) {
      speakerCounts.set(blockquoteSpeaker, (speakerCounts.get(blockquoteSpeaker) ?? 0) + 1);
      totalSpeakerOccurrences += 1;
    }

    letterBlockquote.querySelectorAll("[data-speaker]").forEach((el) => {
      const isInsideDramaTable = el.closest("table[data-drama]") !== null;
      if (isInsideDramaTable) return;

      const firstSpeaker = el.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean)[0];
      if (!firstSpeaker) return;

      speakerCounts.set(firstSpeaker, (speakerCounts.get(firstSpeaker) ?? 0) + 1);
      totalSpeakerOccurrences += 1;
    });

    if (totalSpeakerOccurrences === 0) continue;

    let dominantSpeaker: string | null = null;
    let dominantCount = 0;
    for (const [speaker, count] of speakerCounts) {
      if (count > dominantCount) {
        dominantSpeaker = speaker;
        dominantCount = count;
      }
    }

    const hasDominantSpeaker = dominantSpeaker && dominantCount / totalSpeakerOccurrences > 0.6;
    const letterSpeaker = hasDominantSpeaker ? dominantSpeaker : blockquoteSpeaker;
    if (!letterSpeaker) {
      continue;
    }

    const shell = createAvatarShell(letterSpeaker);
    letterBlockquote.insertBefore(shell, letterBlockquote.firstChild);
  }

  section.querySelectorAll("[data-speaker]").forEach((el) => {
    const speakers = el.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean) ?? [];
    if (speakers.length === 0) return;

    el.classList.add("has-speaker");

    const hasInlineSpeakerChildren =
      (el.tagName.toLowerCase() === "p" || el.tagName.toLowerCase() === "blockquote") &&
      el.querySelector(`:scope > .${INLINE_SPEAKER_LINE_SPEAKER_CLASS}`) !== null;
    if (hasInlineSpeakerChildren) return;

    const isInsideDramaTable = el.closest("table[data-drama]") !== null;
    if (isInsideDramaTable) return;

    const letterBlockquote = el.closest(letterSelector);
    if (letterBlockquote && processedLetterBlockquotes.has(letterBlockquote)) {
      return;
    }

    const hasShellAtStart =
      el.querySelector(":scope > .character-placeholder.character-talking") !== null;
    if (hasShellAtStart) return;

    const isNestedSpeaker = el.parentElement?.closest("[data-speaker]") !== null;
    const shell = createAvatarShell(speakers[0], isNestedSpeaker);

    const avatarContainer = el.querySelector(".character-avatar");
    if (avatarContainer) {
      avatarContainer.appendChild(shell);
    } else {
      el.insertBefore(shell, el.firstChild);
    }
  });

  // Process character mentions per paragraph - only highlight first occurrence of each character
  // Skip highlighting if the character is the speaker of the paragraph
  const paragraphElements = section.querySelectorAll(
    "p, blockquote, h1, h2, h3, h4, h5, h6, li, td, th, div.character-text, div.didaskalia-text",
  );
  const processedSpans = new Set<Element>();

  paragraphElements.forEach((paragraph) => {
    const seenInParagraph = new Set<string>();
    const speakerAttr =
      paragraph.closest("[data-speaker]")?.getAttribute("data-speaker") ??
      paragraph.getAttribute("data-speaker");
    const speakers = new Set(speakerAttr?.split(/\s+/).filter(Boolean) ?? []);

    paragraph.querySelectorAll("span[data-c]").forEach((el) => {
      if (processedSpans.has(el)) return;
      processedSpans.add(el);

      const slug = el.getAttribute("data-c");
      if (slug) {
        el.setAttribute("data-character", slug);
        // Only highlight if: first occurrence AND not a speaker of this paragraph
        if (!seenInParagraph.has(slug) && !speakers.has(slug)) {
          el.classList.add("character-highlighted");
        }
        seenInParagraph.add(slug);
      }
    });
  });

  // Handle any spans not inside a paragraph element (fallback)
  section.querySelectorAll("span[data-c]").forEach((el) => {
    if (processedSpans.has(el)) return;
    const slug = el.getAttribute("data-c");
    if (slug) {
      el.setAttribute("data-character", slug);
      el.classList.add("character-highlighted");
    }
  });

  deduplicateConsecutiveAvatars(section);
  deduplicateConsecutiveMidSentenceSpeakers(section);
}

/**
 * Remove the leading avatar shell from long same-speaker runs (4+ paragraphs).
 * Short runs (1–3 paragraphs) keep all their avatars — that's normal dialogue.
 *
 * Two-pass approach:
 *  1. Walk paragraphs in order and group consecutive same-speaker elements into runs.
 *  2. For runs of length >= MIN_RUN_FOR_DEDUP, remove the avatar from paragraphs 2+.
 *
 * Play rows and drama tables are excluded — each row independently shows its avatar.
 */
const MIN_RUN_FOR_DEDUP = 4;

function deduplicateConsecutiveAvatars(section: Element): void {
  const indexedElements = Array.from(section.querySelectorAll<HTMLElement>("[data-index]")).sort(
    (a, b) => parseInt(a.dataset.index ?? "0", 10) - parseInt(b.dataset.index ?? "0", 10),
  );

  // Pass 1: build runs of consecutive same-speaker paragraphs
  type Run = { elements: HTMLElement[] };
  const runs: Run[] = [];
  let currentRun: Run | null = null;
  let prevTrailingSpeaker: string | null = null;

  for (const el of indexedElements) {
    if (el.closest(".play-row") || el.closest("table[data-drama]")) {
      currentRun = null;
      prevTrailingSpeaker = null;
      continue;
    }

    const shells = el.querySelectorAll<HTMLElement>(".character-placeholder.start-of-paragraph");

    if (shells.length === 0) {
      currentRun = null;
      prevTrailingSpeaker = null;
      continue;
    }

    const leadingSpeaker = shells[0].dataset.character ?? null;
    const trailingSpeaker = shells[shells.length - 1].dataset.character ?? null;

    if (leadingSpeaker && leadingSpeaker === prevTrailingSpeaker && currentRun) {
      currentRun.elements.push(el);
    } else {
      currentRun = { elements: [el] };
      runs.push(currentRun);
    }

    prevTrailingSpeaker = trailingSpeaker;
  }

  // Pass 2: for long runs, strip the avatar from paragraphs after the first
  for (const run of runs) {
    if (run.elements.length < MIN_RUN_FOR_DEDUP) continue;

    for (let i = 1; i < run.elements.length; i++) {
      const el = run.elements[i];
      const shell = el.querySelector<HTMLElement>(".character-placeholder.start-of-paragraph");
      if (shell) {
        shell.remove();
        el.classList.add("speaker-continuation");
      }
    }
  }
}

/**
 * Within each paragraph, hide consecutive mid-sentence speaker avatars for
 * the same character.  Tracks across ALL avatar shells (start-of-paragraph
 * and mid-sentence) so that a mid-sentence avatar immediately following
 * a start-of-paragraph avatar for the same character is also hidden.
 */
function deduplicateConsecutiveMidSentenceSpeakers(section: Element): void {
  const indexedElements = section.querySelectorAll<HTMLElement>("[data-index]");

  for (const el of indexedElements) {
    const allShells = el.querySelectorAll<HTMLElement>(".character-placeholder");
    let prevCharacter: string | null = null;

    for (const shell of allShells) {
      const character = shell.dataset.character ?? null;
      const isMidSentence = shell.classList.contains("mid-sentence-speaker");

      if (isMidSentence && character && character === prevCharacter) {
        shell.remove();
      } else {
        prevCharacter = character;
      }
    }
  }
}

export function detectSourceFormat(html: string): "compiled" | "source" {
  return html.includes('data-index="') ? "compiled" : "source";
}

export type RenderMode = "default" | "enhancedProse" | "poemProse";

export type EnhancedProseOptions = { speakerDisplayNames?: Map<string, string> };

export type ParagraphCountOptions = { renderMode?: RenderMode; bookForm?: string | null };

function createPlayRowFromSpeakerGroup(
  paragraphs: Element[],
  doc: Document,
  state: { lastSpeaker: string | null; alignment: "left" | "right" },
  options: EnhancedProseOptions,
): Element {
  const firstPara = paragraphs[0];
  const speakers = firstPara.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean) ?? [];
  const firstSpeaker = speakers[0] || "";

  // Update alignment state based on speaker change
  if (firstSpeaker && firstSpeaker !== state.lastSpeaker) {
    state.alignment =
      state.lastSpeaker === null ? "left" : state.alignment === "left" ? "right" : "left";
    state.lastSpeaker = firstSpeaker;
  }

  const playRow = doc.createElement("div");
  playRow.className = "play-row";
  playRow.setAttribute("data-text-alignment", state.alignment);
  playRow.setAttribute("data-speaker", speakers.join(" "));

  const characterAvatar = doc.createElement("div");
  characterAvatar.className = "character-avatar";

  const characterText = doc.createElement("div");
  characterText.className = "character-text";

  // Add speaker label ONCE (from first paragraph only)
  const labelP = doc.createElement("p");
  labelP.setAttribute("data-text-alignment", state.alignment);
  labelP.setAttribute("data-is-character", "true");
  labelP.setAttribute("data-is-didaskalia", "false");

  const displayName =
    options.speakerDisplayNames?.get(firstSpeaker) ?? firstSpeaker.replace(/-/g, " ");
  const strong = doc.createElement("strong");
  strong.textContent = displayName;
  labelP.appendChild(strong);
  characterText.appendChild(labelP);

  // Add all content paragraphs from the group
  for (const para of paragraphs) {
    const contentP = para.cloneNode(true) as Element;
    contentP.removeAttribute("data-speaker");
    contentP.setAttribute("data-text-alignment", state.alignment);
    contentP.setAttribute("data-is-character", "false");
    contentP.setAttribute("data-is-didaskalia", "false");
    characterText.appendChild(contentP);
  }

  playRow.appendChild(characterAvatar);
  playRow.appendChild(characterText);

  return playRow;
}

function createDidaskaliaPlayRow(p: Element, doc: Document): Element {
  const playRow = doc.createElement("div");
  playRow.className = "play-row didaskalia-row";

  const didaskaliaText = doc.createElement("div");
  didaskaliaText.className = "didaskalia-text";

  const contentP = p.cloneNode(true) as Element;
  contentP.setAttribute("data-is-didaskalia", "true");
  didaskaliaText.appendChild(contentP);

  playRow.appendChild(didaskaliaText);
  return playRow;
}

function isPureEmParagraph(p: Element): boolean {
  const html = p.innerHTML.trim();
  const emMatch = html.match(/^<em[^>]*>([\s\S]*)<\/em>$/);
  if (!emMatch) return false;
  const withoutEm = html.replace(/<em[^>]*>[\s\S]*<\/em>/g, "").trim();
  return withoutEm.length === 0;
}

function transformProseToPlayRows(
  section: Element,
  doc: Document,
  options: EnhancedProseOptions,
): void {
  const state = { lastSpeaker: null as string | null, alignment: "left" as "left" | "right" };
  const children = Array.from(section.children);
  let i = 0;

  while (i < children.length) {
    const child = children[i];

    if (child.tagName.toLowerCase() !== "p") {
      i++;
      continue;
    }
    if (child.closest("table[data-drama]")) {
      i++;
      continue;
    }

    const speaker = child.getAttribute("data-speaker");
    const isPureEm = isPureEmParagraph(child);

    if (speaker) {
      // Collect consecutive paragraphs with the same speaker
      const group: Element[] = [child];
      let j = i + 1;

      while (j < children.length) {
        const nextChild = children[j];
        if (
          nextChild.tagName.toLowerCase() === "p" &&
          nextChild.getAttribute("data-speaker") === speaker &&
          !nextChild.closest("table[data-drama]")
        ) {
          group.push(nextChild);
          j++;
        } else {
          break;
        }
      }

      // Create single play-row for the group
      const playRow = createPlayRowFromSpeakerGroup(group, doc, state, options);

      // Replace first element with play-row, remove rest from DOM
      section.replaceChild(playRow, group[0]);
      for (let k = 1; k < group.length; k++) {
        section.removeChild(group[k]);
      }

      // Skip past all grouped elements in the static children array
      i += group.length;
    } else if (isPureEm) {
      const playRow = createDidaskaliaPlayRow(child, doc);
      section.replaceChild(playRow, child);
      i++;
    } else {
      i++;
    }
  }
}

export function normalizeChapterHtmlEnhanced(
  html: string,
  options: EnhancedProseOptions = {},
): string {
  const sanitized = sanitizeHtml(html);
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, "text/html");
  const section = doc.querySelector("section[data-chapter]");

  if (!section) {
    console.warn("[normalizeChapterHtmlEnhanced] No section[data-chapter] found");
    return sanitized;
  }

  transformProseToPlayRows(section, doc, options);
  section.setAttribute("data-chapter-format", "mixed");
  wrapPlayElements(section, doc);
  injectDataIndex(section);
  preprocessInlineSpeakerSpans(section, doc);
  injectAvatarShells(section, doc);
  transformFigureUrls(section);

  const wrapper = doc.createElement("section");
  wrapper.appendChild(section.cloneNode(true));

  return wrapper.outerHTML;
}

export type PoemProseOptions = { speakerDisplayNames?: Map<string, string> };

/**
 * Create a play-row from a single speaker paragraph.
 * Unlike enhancedProse, this does NOT group consecutive paragraphs.
 * Supports data-label attribute for custom speaker labels.
 */
function createPlayRowFromParagraph(
  paragraph: Element,
  doc: Document,
  state: { lastSpeaker: string | null; alignment: "left" | "right" },
  options: PoemProseOptions,
): Element {
  const speakers = paragraph.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean) ?? [];
  const firstSpeaker = speakers[0] || "";
  const explicitLabel = paragraph.getAttribute("data-label");

  // Update alignment state based on speaker change
  if (firstSpeaker && firstSpeaker !== state.lastSpeaker) {
    state.alignment =
      state.lastSpeaker === null ? "left" : state.alignment === "left" ? "right" : "left";
    state.lastSpeaker = firstSpeaker;
  }

  const playRow = doc.createElement("div");
  playRow.className = "play-row";
  playRow.setAttribute("data-text-alignment", state.alignment);
  playRow.setAttribute("data-speaker", speakers.join(" "));

  const characterAvatar = doc.createElement("div");
  characterAvatar.className = "character-avatar";

  const characterText = doc.createElement("div");
  characterText.className = "character-text";

  // Add speaker label
  const labelP = doc.createElement("p");
  labelP.setAttribute("data-text-alignment", state.alignment);
  labelP.setAttribute("data-is-character", "true");
  labelP.setAttribute("data-is-didaskalia", "false");

  // Use explicit label if present, otherwise derive from slug or displayNames
  let displayName: string;
  if (explicitLabel) {
    displayName = explicitLabel;
  } else {
    displayName =
      options.speakerDisplayNames?.get(firstSpeaker) ??
      firstSpeaker
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
  }
  const strong = doc.createElement("strong");
  strong.textContent = displayName;
  labelP.appendChild(strong);
  characterText.appendChild(labelP);

  // Add the content paragraph
  const contentP = paragraph.cloneNode(true) as Element;
  contentP.removeAttribute("data-speaker");
  contentP.removeAttribute("data-label");
  contentP.setAttribute("data-text-alignment", state.alignment);
  contentP.setAttribute("data-is-character", "false");
  contentP.setAttribute("data-is-didaskalia", "false");
  characterText.appendChild(contentP);

  playRow.appendChild(characterAvatar);
  playRow.appendChild(characterText);

  return playRow;
}

/**
 * Recursively transform paragraphs with data-speaker into play-rows.
 * Handles nested sections (like poem sections in Paradise Lost).
 */
function transformPoemToPlayRows(
  container: Element,
  doc: Document,
  state: { lastSpeaker: string | null; alignment: "left" | "right" },
  options: PoemProseOptions,
): void {
  const children = Array.from(container.children);

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const tagName = child.tagName.toLowerCase();

    // Recursively process nested sections (but not data-chapter sections)
    if (tagName === "section" && !child.hasAttribute("data-chapter")) {
      transformPoemToPlayRows(child, doc, state, options);
      continue;
    }

    // Skip if not a paragraph or already processed
    if (tagName !== "p") {
      continue;
    }

    const speaker = child.getAttribute("data-speaker");
    const isPureEm = isPureEmParagraph(child);

    if (speaker) {
      // Transform speaker paragraph into play-row
      const playRow = createPlayRowFromParagraph(child, doc, state, options);
      container.replaceChild(playRow, child);
    } else if (isPureEm) {
      // Stage direction
      const playRow = createDidaskaliaPlayRow(child, doc);
      container.replaceChild(playRow, child);
    }
    // Non-speaker, non-didaskalia paragraphs are left as-is (narrative text)
  }
}

/**
 * Unwrap nested poem/verse/song sections so play-rows become direct children
 * of section[data-chapter]. This ensures CSS applies consistently.
 */
function unwrapPoemSections(section: Element): void {
  const poemSelectors = [
    'section[data-epub-type~="z3998:poem"]',
    'section[data-epub-type~="z3998:verse"]',
    'section[data-epub-type~="z3998:song"]',
    'section[data-epub-type~="z3998:hymn"]',
  ];

  for (const selector of poemSelectors) {
    // Keep querying because DOM changes as we unwrap
    let poemSection: Element | null;
    while ((poemSection = section.querySelector(selector))) {
      const parent = poemSection.parentElement;
      if (!parent) break;

      // Move all children before the poem section
      while (poemSection.firstChild) {
        parent.insertBefore(poemSection.firstChild, poemSection);
      }
      // Remove the empty wrapper
      parent.removeChild(poemSection);
    }
  }
}

/**
 * Normalize chapter HTML using poemProse mode.
 * Key differences from enhancedProse:
 * - Each data-speaker paragraph becomes its own play-row (no grouping)
 * - Supports data-label attribute for custom speaker labels
 * - Unwraps poem sections so play-rows are direct children (matching enhancedProse structure)
 */
export function normalizeChapterHtmlPoemProse(
  html: string,
  options: PoemProseOptions = {},
): string {
  const sanitized = sanitizeHtml(html);
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, "text/html");
  const section = doc.querySelector("section[data-chapter]");

  if (!section) {
    console.warn("[normalizeChapterHtmlPoemProse] No section[data-chapter] found");
    return sanitized;
  }

  const state = { lastSpeaker: null as string | null, alignment: "left" as "left" | "right" };
  transformPoemToPlayRows(section, doc, state, options);
  unwrapPoemSections(section); // Remove poem wrappers so structure matches enhancedProse
  section.setAttribute("data-chapter-format", "mixed");
  injectDataIndex(section);
  preprocessInlineSpeakerSpans(section, doc);
  injectAvatarShells(section, doc);
  transformFigureUrls(section);

  const wrapper = doc.createElement("section");
  wrapper.appendChild(section.cloneNode(true));

  return wrapper.outerHTML;
}

/**
 * Transform img src attributes to use resolved figure URLs from registry.
 */
export function transformFigureUrls(section: Element): void {
  const images = section.querySelectorAll("img");
  for (const img of Array.from(images)) {
    const src = img.getAttribute("src");
    if (src) {
      const resolvedUrl = getFigureUrl(src);
      if (resolvedUrl) {
        img.setAttribute("src", resolvedUrl);
      }
    }
  }
}

export function normalizeChapterHtml(html: string): string {
  const sanitized = sanitizeHtml(html);
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, "text/html");
  const section = doc.querySelector("section[data-chapter]");

  if (!section) {
    console.warn("[normalizeChapterHtml] No section[data-chapter] found");
    return sanitized;
  }

  // Transform Format B speaker blocks first (before other transformations)
  transformFormatBToPlayRows(section, doc);
  wrapPlayElements(section, doc);
  injectDataIndex(section);
  preprocessInlineSpeakerSpans(section, doc);
  injectAvatarShells(section, doc);
  transformFigureUrls(section);

  const wrapper = doc.createElement("section");
  wrapper.appendChild(section.cloneNode(true));

  return wrapper.outerHTML;
}

export function normalizeBookHtml(html: string): string {
  const sanitized = sanitizeHtml(html);
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, "text/html");
  const sections = doc.querySelectorAll("section[data-chapter]");

  if (sections.length === 0) {
    console.warn("[normalizeBookHtml] No section[data-chapter] found");
    return sanitized;
  }

  sections.forEach((section) => {
    wrapPlayElements(section, doc);
    injectDataIndex(section);
    preprocessInlineSpeakerSpans(section, doc);
    injectAvatarShells(section, doc);
    transformFigureUrls(section);
  });

  return doc.body.innerHTML;
}

function countDataIndexFromHtml(html: string): number {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.querySelectorAll("[data-index]").length;
}

/**
 * Count paragraphs the same way the player indexes them (via data-index).
 * This ensures calculateReadProgress stays accurate without loading all chapters client-side.
 */
export function countParagraphsFromChapterHtml(
  html: string,
  options: ParagraphCountOptions = {},
): number {
  if (!html.trim()) {
    return 0;
  }

  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is not available. Provide a DOMParser implementation first.");
  }

  let normalizedHtml = html;
  if (detectSourceFormat(html) === "source") {
    const renderMode = options.renderMode ?? "default";
    const bookForm = options.bookForm?.toLowerCase() ?? "";
    const useEnhancedProse = renderMode === "enhancedProse" && bookForm !== "play";
    const usePoemProse = renderMode === "poemProse";

    if (usePoemProse) {
      normalizedHtml = normalizeChapterHtmlPoemProse(html);
    } else if (useEnhancedProse) {
      normalizedHtml = normalizeChapterHtmlEnhanced(html);
    } else {
      normalizedHtml = normalizeChapterHtml(html);
    }
  }

  return countDataIndexFromHtml(normalizedHtml);
}

export interface CharacterOccurrence {
  slug: string;
  chapter: number;
  paragraph: number;
  isSpeaking: boolean;
  isEntering?: boolean;
  isExiting?: boolean;
}

export function extractCharacterOccurrences(
  section: Element,
  chapterNumber: number,
): CharacterOccurrence[] {
  const occurrences: CharacterOccurrence[] = [];
  const isPlayFormat = section.querySelector(".play-row") !== null;

  if (isPlayFormat) {
    section.querySelectorAll("[data-index]").forEach((el) => {
      const paragraphIndex = parseInt(el.getAttribute("data-index") || "0", 10);

      const speakerEl = el.closest("[data-speaker]");
      if (speakerEl) {
        const speakers = speakerEl.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean) ?? [];
        const isFirstInRow = el === speakerEl.querySelector("[data-index]");
        if (isFirstInRow) {
          for (const slug of speakers) {
            occurrences.push({
              slug,
              chapter: chapterNumber,
              paragraph: paragraphIndex,
              isSpeaking: true,
            });
          }
        }
      }

      el.querySelectorAll("span[data-c]").forEach((mention) => {
        const slug = mention.getAttribute("data-c");
        if (slug) {
          const isEntering = mention.getAttribute("data-enters") === "true";
          const isExiting = mention.getAttribute("data-exits") === "true";
          occurrences.push({
            slug,
            chapter: chapterNumber,
            paragraph: paragraphIndex,
            isSpeaking: false,
            isEntering,
            isExiting,
          });
        }
      });
    });
  } else {
    section.querySelectorAll("[data-index]").forEach((child) => {
      const paragraphIndex = parseInt(child.getAttribute("data-index") || "0", 10);
      const speakingInParagraph = new Set<string>();
      const addSpeakerOccurrences = (speakerAttr: string | null) => {
        const speakers = speakerAttr?.split(/\s+/).filter(Boolean) ?? [];
        for (const slug of speakers) {
          if (speakingInParagraph.has(slug)) continue;
          speakingInParagraph.add(slug);
          occurrences.push({
            slug,
            chapter: chapterNumber,
            paragraph: paragraphIndex,
            isSpeaking: true,
          });
        }
      };

      const closestSpeakerContainer = child.parentElement?.closest("[data-speaker]");
      addSpeakerOccurrences(closestSpeakerContainer?.getAttribute("data-speaker") ?? null);
      addSpeakerOccurrences(child.getAttribute("data-speaker"));
      child.querySelectorAll("[data-speaker]").forEach((speakerEl) => {
        addSpeakerOccurrences(speakerEl.getAttribute("data-speaker"));
      });

      child.querySelectorAll("span[data-c]").forEach((mention) => {
        const slug = mention.getAttribute("data-c");
        if (slug) {
          occurrences.push({
            slug,
            chapter: chapterNumber,
            paragraph: paragraphIndex,
            isSpeaking: false,
          });
        }
      });
    });
  }

  return occurrences;
}

export function countParagraphs(section: Element): number {
  const isPlayFormat = section.querySelector(".play-row") !== null;

  if (isPlayFormat) {
    let count = 0;
    for (const child of Array.from(section.children)) {
      const tagName = child.tagName.toLowerCase();
      if (tagName === "h3" || tagName === "h4" || tagName === "h5") {
        count++;
      } else if (child.classList.contains("play-row")) {
        count += child.querySelectorAll(".character-text p, .didaskalia-text p").length;
      }
    }
    return count;
  }
  return section.children.length;
}

export function stripCharacterMarkup(html: string): string {
  let result = html.replace(/<span\s+data-c="[^"]*">([^<]*)<\/span>/g, "$1");
  const unwrapSpeakerPatterns = [
    /<span\b[^>]*\bdata-speaker="[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
    /<span\b[^>]*\bclass="[^"]*\binline-speaker-line\b[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
  ];

  for (const pattern of unwrapSpeakerPatterns) {
    let previousResult = "";
    while (previousResult !== result) {
      previousResult = result;
      result = result.replace(pattern, "$1");
    }
  }

  result = result.replace(/\s+data-speaker="[^"]*"/g, "");
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

export function compareStructure(
  original: string,
  withCharacters: string,
): { match: boolean; originalNormalized: string; withCharactersNormalized: string } {
  const originalNormalized = stripCharacterMarkup(original);
  const withCharactersNormalized = stripCharacterMarkup(withCharacters);
  return {
    match: originalNormalized === withCharactersNormalized,
    originalNormalized,
    withCharactersNormalized,
  };
}
