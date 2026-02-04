import { JSDOM } from "jsdom";

const HTML_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "audio",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "i",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "link",
  "main",
  "map",
  "mark",
  "meta",
  "meter",
  "nav",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "param",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "section",
  "select",
  "small",
  "source",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
]);

const IGNORED_CUSTOM_TAGS = new Set(["hgroup"]);
const NON_SPEAKER_TAGS = new Set(["note", "see"]);

function slugifyTag(tagName: string): string {
  return tagName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function copyAttributes(target: Element, source: Element, skip: Set<string>): void {
  for (const attr of Array.from(source.attributes)) {
    const name = attr.name.toLowerCase();
    if (skip.has(name)) continue;
    target.setAttribute(attr.name, attr.value);
  }
}

function normalizeInvalidSeeTags(html: string): string {
  return html.replace(/<see\s+([^>]+)>/gi, (match, rawValue) => {
    const value = String(rawValue).trim();
    if (!value || value.includes("=")) {
      return match;
    }
    const escaped = value.replace(/"/g, "&quot;");
    return `<see data-see="${escaped}"></see>`;
  });
}

function isCustomTag(tagName: string): boolean {
  const lower = tagName.toLowerCase();
  if (HTML_TAGS.has(lower)) return false;
  if (IGNORED_CUSTOM_TAGS.has(lower)) return false;
  return true;
}

function findFirstSignificantElement(p: Element): Element | null {
  for (const node of Array.from(p.childNodes)) {
    if (node.nodeType === 3) {
      if (node.textContent?.trim()) return null;
      continue;
    }
    if (node.nodeType === 1) return node as Element;
  }
  return null;
}

function isEmptyElement(element: Element): boolean {
  if (element.children.length > 0) return false;
  return !(element.textContent ?? "").trim();
}

function unwrapElement(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function convertNotes(doc: Document): boolean {
  let didFix = false;
  const notes = Array.from(doc.querySelectorAll("note"));
  for (const note of notes) {
    const id = note.getAttribute("id") ?? "";
    const anchor = doc.createElement("a");
    anchor.className = "link-note";
    if (id) {
      anchor.setAttribute("data-note", id);
      anchor.textContent = id;
    }
    note.replaceWith(anchor);
    didFix = true;
  }
  return didFix;
}

function promoteSpeakerTags(doc: Document): boolean {
  let didFix = false;
  const paragraphs = Array.from(doc.querySelectorAll("p"));
  for (const p of paragraphs) {
    const firstElement = findFirstSignificantElement(p);
    if (!firstElement) continue;
    const tagName = firstElement.tagName.toLowerCase();
    if (!isCustomTag(tagName)) continue;
    if (NON_SPEAKER_TAGS.has(tagName)) continue;
    const hasTalking = firstElement.getAttribute("talking") === "true";
    if (!hasTalking && !isEmptyElement(firstElement)) continue;

    const slug = slugifyTag(tagName);
    if (!slug) continue;
    if (!p.hasAttribute("data-speaker")) {
      p.setAttribute("data-speaker", slug);
    }
    if (firstElement.childNodes.length > 0) {
      unwrapElement(firstElement);
    } else {
      firstElement.remove();
    }
    didFix = true;
  }
  return didFix;
}

function convertInlineCustomTags(doc: Document): boolean {
  let didFix = false;
  const elements = Array.from(doc.querySelectorAll("*"));
  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    if (!isCustomTag(tagName)) continue;
    if (tagName === "note") continue;
    if (IGNORED_CUSTOM_TAGS.has(tagName)) continue;

    if (tagName === "see") {
      const span = doc.createElement("span");
      copyAttributes(span, element, new Set(["talking"]));
      const text = (element.textContent || "").trim();
      if (text.length > 0) {
        span.textContent = text;
      }
      element.replaceWith(span);
      didFix = true;
      continue;
    }

    const slug = slugifyTag(tagName);
    if (!slug) continue;

    const span = doc.createElement("span");
    span.setAttribute("data-c", slug);
    copyAttributes(span, element, new Set(["talking"]));

    const text = (element.textContent || "").trim();
    if (text.length > 0) {
      span.textContent = text;
    }

    element.replaceWith(span);
    didFix = true;
  }
  return didFix;
}

export function fixNonPlayCustomTags(html: string): string {
  const normalized = normalizeInvalidSeeTags(html);
  const dom = new JSDOM(normalized);
  const doc = dom.window.document;

  const didFixNotes = convertNotes(doc);
  const didFixSpeakers = promoteSpeakerTags(doc);
  const didFixInline = convertInlineCustomTags(doc);

  if (didFixNotes || didFixSpeakers || didFixInline || normalized !== html) {
    return doc.body.innerHTML;
  }
  return html;
}
