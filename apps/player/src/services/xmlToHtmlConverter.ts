const STANDARD_TAGS = new Set([
  "p",
  "h3",
  "h4",
  "h5",
  "em",
  "strong",
  "br",
  "div",
  "blockquote",
  "note",
  "linebreak",
  "chapter",
  "span",
  "i",
  "b",
  "a",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "table",
  "tr",
  "td",
  "th",
  "thead",
  "tbody",
  "act",
  "title",
  "subtitle",
]);

function isCharacterTag(tagName: string): boolean {
  return !STANDARD_TAGS.has(tagName.toLowerCase()) && /^[A-Z]/.test(tagName);
}

function slugifyTagName(tagName: string): string {
  return tagName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function convertCharacterElement(el: Element): { html: string; speaker: string | null } {
  const slug = slugifyTagName(el.tagName);
  const isTalking = el.getAttribute("talking") === "true";
  const isEntering = el.getAttribute("enters") === "true";
  const isExiting = el.getAttribute("exits") === "true";
  const text = el.textContent || "";

  if (isTalking) {
    return { html: text, speaker: slug };
  }

  if (text.trim()) {
    const attrs = [`data-c="${slug}"`];
    if (isEntering) attrs.push('data-enters="true"');
    if (isExiting) attrs.push('data-exits="true"');
    return { html: `<span ${attrs.join(" ")}>${text}</span>`, speaker: null };
  }

  return { html: "", speaker: slug };
}

function convertNote(el: Element): string {
  const id = el.getAttribute("id") || "";
  const text = el.textContent?.trim() || `[${id}]`;
  return `<a data-note="${id}">${text}</a>`;
}

function convertPlayElement(el: Element, htmlTag: string): string {
  const text = el.textContent || "";
  switch (el.tagName.toLowerCase()) {
    case "act":
      return `<h3 class="act">${text}</h3>`;
    case "title":
      return `<h4 class="scene-title">${text}</h4>`;
    case "subtitle":
      return `<p class="scene-subtitle"><em>${text}</em></p>`;
    default:
      return `<${htmlTag}>${text}</${htmlTag}>`;
  }
}

function convertElement(el: Element): { html: string; speakers: string[] } {
  const tag = el.tagName.toLowerCase();

  if (isCharacterTag(el.tagName)) {
    const result = convertCharacterElement(el);
    return { html: result.html, speakers: result.speaker ? [result.speaker] : [] };
  }

  switch (tag) {
    case "note":
      return { html: convertNote(el), speakers: [] };
    case "linebreak":
    case "br":
      return { html: "<br>", speakers: [] };
    case "act":
    case "title":
    case "subtitle":
      return { html: convertPlayElement(el, tag), speakers: [] };
    default:
      return convertStandardElement(el, tag);
  }
}

function convertStandardElement(el: Element, htmlTag: string): { html: string; speakers: string[] } {
  let inner = "";
  const speakers: string[] = [];

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      inner += node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const converted = convertElement(node as Element);
      inner += converted.html;
      speakers.push(...converted.speakers);
    }
  }

  const attrs: string[] = [];
  if (speakers.length > 0) {
    attrs.push(`data-speaker="${speakers.join(" ")}"`);
  }
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === "id" || attr.name === "class") {
      attrs.push(`${attr.name}="${attr.value}"`);
    }
  }

  const attrStr = attrs.length ? " " + attrs.join(" ") : "";
  const validTag = STANDARD_TAGS.has(htmlTag) ? htmlTag : "div";

  return { html: `<${validTag}${attrStr}>${inner}</${validTag}>`, speakers: [] };
}

export function convertXmlChapterToHtml(xml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent}`);
  }

  const chapter = doc.querySelector("Chapter");
  if (!chapter) {
    throw new Error("No Chapter element found in XML");
  }

  const chapterId = chapter.getAttribute("id") || "1";
  let html = `<section data-chapter="${chapterId}">`;

  for (const child of Array.from(chapter.children)) {
    const converted = convertElement(child);
    html += converted.html;
  }

  html += "</section>";
  return html;
}

export function convertCompiledHtmlToSource(compiledHtml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(compiledHtml, "text/html");
  const section = doc.querySelector("section[data-chapter]");

  if (!section) {
    throw new Error("No section[data-chapter] found in compiled HTML");
  }

  section.querySelectorAll("[data-index]").forEach((el) => {
    el.removeAttribute("data-index");
  });

  section.querySelectorAll(".character-placeholder").forEach((el) => {
    const slug = el.getAttribute("data-character");
    const isTalking = el.getAttribute("data-is-talking") === "true";
    const parent = el.parentElement;

    if (isTalking && slug && parent) {
      const existingSpeakers = parent.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean) ?? [];
      if (!existingSpeakers.includes(slug)) {
        existingSpeakers.push(slug);
      }
      parent.setAttribute("data-speaker", existingSpeakers.join(" "));
    }

    el.remove();
  });

  section.querySelectorAll(".character-highlighted").forEach((el) => {
    el.classList.remove("character-highlighted", "character-highlighted-activated");
    const slug = el.getAttribute("data-character");
    if (slug) {
      el.setAttribute("data-c", slug);
      el.removeAttribute("data-character");
    }
  });

  section.querySelectorAll(".text-nowrap").forEach((el) => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    }
  });

  section.querySelectorAll(".has-speaker").forEach((el) => {
    el.classList.remove("has-speaker");
  });

  section.querySelectorAll("[class]").forEach((el) => {
    if (el.getAttribute("class")?.trim() === "") {
      el.removeAttribute("class");
    }
  });

  return section.outerHTML;
}

export function extractChapterMetadata(html: string): { chapterNumber: number; title: string | null; paragraphCount: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const section = doc.querySelector("section[data-chapter]");

  if (!section) {
    throw new Error("No section[data-chapter] found");
  }

  const chapterNumber = parseInt(section.getAttribute("data-chapter") || "1", 10);
  const titleEl = section.querySelector("h3, h4, h5");
  const title = titleEl?.textContent?.trim() || null;
  const paragraphCount = section.children.length;

  return { chapterNumber, title, paragraphCount };
}
