import { JSDOM } from "jsdom";

const KNOWN_HTML_TAGS = new Set([
  "a",
  "article",
  "aside",
  "b",
  "blockquote",
  "br",
  "button",
  "caption",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "main",
  "ol",
  "p",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

function slugifyTag(tagName: string): string {
  return tagName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isConvertibleStageDirectionNode(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (KNOWN_HTML_TAGS.has(tagName)) return false;
  if (!element.closest("em")) return false;
  return true;
}

function getAttrValue(element: Element, name: string): string | null {
  if (element.hasAttribute(name)) return element.getAttribute(name);
  return null;
}

function copyAttributes(target: Element, source: Element, skip: Set<string>): void {
  for (const attr of Array.from(source.attributes)) {
    const name = attr.name.toLowerCase();
    if (skip.has(name)) continue;
    target.setAttribute(attr.name, attr.value);
  }
}

export function fixLegacyPlayStageDirections(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  let didFix = false;

  const allElements = Array.from(doc.querySelectorAll("*"));
  for (const element of allElements) {
    if (!isConvertibleStageDirectionNode(element)) continue;

    const tagName = element.tagName.toLowerCase();
    const slug = slugifyTag(tagName);
    if (!slug) continue;

    const span = doc.createElement("span");
    span.setAttribute("data-c", slug);

    const entersValue = getAttrValue(element, "enters") ?? getAttrValue(element, "data-enters");
    const exitsValue = getAttrValue(element, "exits") ?? getAttrValue(element, "data-exits");

    copyAttributes(
      span,
      element,
      new Set(["enters", "exits", "data-enters", "data-exits", "talking"]),
    );

    if (entersValue !== null) {
      span.setAttribute("data-enters", entersValue || "true");
    }
    if (exitsValue !== null) {
      span.setAttribute("data-exits", exitsValue || "true");
    }

    const text = (element.textContent || "").trim();
    if (text.length > 0) {
      span.textContent = text;
    }

    element.replaceWith(span);
    didFix = true;
  }

  return didFix ? doc.body.innerHTML : html;
}
