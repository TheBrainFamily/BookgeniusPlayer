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

export function fixLegacyPlayCustomTags(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  let didFix = false;

  const allElements = Array.from(doc.querySelectorAll("*"));
  for (const element of allElements) {
    const tagName = element.tagName.toLowerCase();
    if (HTML_TAGS.has(tagName)) continue;

    const slug = slugifyTag(tagName);
    if (!slug) continue;

    const span = doc.createElement("span");
    span.setAttribute("data-c", slug);

    const entersValue = element.getAttribute("enters") ?? element.getAttribute("data-enters");
    const exitsValue = element.getAttribute("exits") ?? element.getAttribute("data-exits");

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
