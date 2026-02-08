import { getFigureUrl } from "@player/utils/assetUrls";

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

function indexMixedFormatChildren(section: Element): void {
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
    indexMixedFormatChildren(section);
  } else {
    indexPurePlayFormat(section);
  }
}

export function injectAvatarShells(section: Element, doc: Document): void {
  const createAvatarShell = (speaker: string): HTMLSpanElement => {
    const shell = doc.createElement("span");
    shell.className = "character-placeholder character-talking start-of-paragraph";
    shell.setAttribute("data-character", speaker);
    shell.setAttribute("data-is-talking", "true");
    return shell;
  };

  const letterSelector = 'blockquote[data-epub-type~="z3998:letter"]';
  const letterBlockquotes = Array.from(section.querySelectorAll(letterSelector));
  const processedLetterBlockquotes = new WeakSet<Element>();

  for (const letterBlockquote of letterBlockquotes) {
    processedLetterBlockquotes.add(letterBlockquote);

    const speakerCounts = new Map<string, number>();
    let totalSpeakerOccurrences = 0;

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

    if (!dominantSpeaker || dominantCount / totalSpeakerOccurrences <= 0.6) {
      continue;
    }

    const shell = createAvatarShell(dominantSpeaker);
    letterBlockquote.insertBefore(shell, letterBlockquote.firstChild);
  }

  section.querySelectorAll("[data-speaker]").forEach((el) => {
    const speakers = el.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean) ?? [];
    if (speakers.length === 0) return;

    el.classList.add("has-speaker");

    const isInsideDramaTable = el.closest("table[data-drama]") !== null;
    if (isInsideDramaTable) return;

    const letterBlockquote = el.closest(letterSelector);
    if (letterBlockquote && processedLetterBlockquotes.has(letterBlockquote)) {
      return;
    }

    const shell = createAvatarShell(speakers[0]);

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
    let paragraphIndex = 0;
    for (const child of Array.from(section.children)) {
      const speakers = child.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean) ?? [];
      for (const slug of speakers) {
        occurrences.push({
          slug,
          chapter: chapterNumber,
          paragraph: paragraphIndex,
          isSpeaking: true,
        });
      }

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

      paragraphIndex++;
    }
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
