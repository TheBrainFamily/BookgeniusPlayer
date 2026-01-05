const BLOCKED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "link", "meta", "base", "noscript"]);

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
  return element.tagName.toLowerCase() === "div" && element.querySelector("[data-speaker-label]") !== null;
}

function processPlayContainer(container: Element, doc: Document, state: { lastSpeaker: string | null; alignment: "left" | "right" }): void {
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
        state.alignment = state.lastSpeaker === null ? "left" : state.alignment === "left" ? "right" : "left";
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
  section.querySelectorAll("[data-speaker]").forEach((el) => {
    const speakers = el.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean) ?? [];
    if (speakers.length === 0) return;

    el.classList.add("has-speaker");

    const isInsideDramaTable = el.closest("table[data-drama]") !== null;
    if (isInsideDramaTable) return;

    const shell = doc.createElement("span");
    shell.className = "character-placeholder character-talking start-of-paragraph";
    shell.setAttribute("data-character", speakers[0]);
    shell.setAttribute("data-is-talking", "true");

    const avatarContainer = el.querySelector(".character-avatar");
    if (avatarContainer) {
      avatarContainer.appendChild(shell);
    } else {
      el.insertBefore(shell, el.firstChild);
    }
  });

  section.querySelectorAll("span[data-c]").forEach((el) => {
    el.classList.add("character-highlighted");
    const slug = el.getAttribute("data-c");
    if (slug) {
      el.setAttribute("data-character", slug);
    }
  });
}

export function detectSourceFormat(html: string): "compiled" | "source" {
  return html.includes('data-index="') ? "compiled" : "source";
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

  wrapPlayElements(section, doc);
  injectDataIndex(section);
  injectAvatarShells(section, doc);

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
  });

  return doc.body.innerHTML;
}

export interface CharacterOccurrence {
  slug: string;
  chapter: number;
  paragraph: number;
  isSpeaking: boolean;
  isEntering?: boolean;
  isExiting?: boolean;
}

export function extractCharacterOccurrences(section: Element, chapterNumber: number): CharacterOccurrence[] {
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
            occurrences.push({ slug, chapter: chapterNumber, paragraph: paragraphIndex, isSpeaking: true });
          }
        }
      }

      el.querySelectorAll("span[data-c]").forEach((mention) => {
        const slug = mention.getAttribute("data-c");
        if (slug) {
          const isEntering = mention.getAttribute("data-enters") === "true";
          const isExiting = mention.getAttribute("data-exits") === "true";
          occurrences.push({ slug, chapter: chapterNumber, paragraph: paragraphIndex, isSpeaking: false, isEntering, isExiting });
        }
      });
    });
  } else {
    let paragraphIndex = 0;
    for (const child of Array.from(section.children)) {
      const speakers = child.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean) ?? [];
      for (const slug of speakers) {
        occurrences.push({ slug, chapter: chapterNumber, paragraph: paragraphIndex, isSpeaking: true });
      }

      child.querySelectorAll("span[data-c]").forEach((mention) => {
        const slug = mention.getAttribute("data-c");
        if (slug) {
          occurrences.push({ slug, chapter: chapterNumber, paragraph: paragraphIndex, isSpeaking: false });
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

export function compareStructure(original: string, withCharacters: string): { match: boolean; originalNormalized: string; withCharactersNormalized: string } {
  const originalNormalized = stripCharacterMarkup(original);
  const withCharactersNormalized = stripCharacterMarkup(withCharacters);
  return { match: originalNormalized === withCharactersNormalized, originalNormalized, withCharactersNormalized };
}
