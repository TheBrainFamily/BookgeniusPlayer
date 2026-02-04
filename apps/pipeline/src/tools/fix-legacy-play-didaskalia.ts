import { JSDOM } from "jsdom";

const BOUNDARY_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function isSpeakerBlock(element: Element): boolean {
  if (element.tagName.toLowerCase() !== "div") return false;
  if (!element.hasAttribute("data-speaker")) return false;
  return (
    element.hasAttribute("data-label") || element.querySelector("[data-speaker-label]") !== null
  );
}

function hasNonWhitespaceText(nodes: ChildNode[]): boolean {
  return nodes.some((node) => node.nodeType === 3 && node.textContent?.trim());
}

function onlyElementChild(element: Element): Element | null {
  const children = Array.from(element.children);
  if (children.length !== 1) return null;
  return children[0];
}

function isPureEmParagraph(p: Element): boolean {
  if (hasNonWhitespaceText(Array.from(p.childNodes))) return false;

  const directChild = onlyElementChild(p);
  if (!directChild) return false;
  if (directChild.tagName.toLowerCase() === "em") return true;

  if (directChild.tagName.toLowerCase() !== "span") return false;
  if (hasNonWhitespaceText(Array.from(directChild.childNodes))) return false;

  const spanChild = onlyElementChild(directChild);
  return spanChild?.tagName.toLowerCase() === "em";
}

function isDidaskaliaParagraph(element: Element): boolean {
  if (element.tagName.toLowerCase() !== "p") return false;
  if (element.getAttribute("data-is-didaskalia") === "true") return true;
  return isPureEmParagraph(element);
}

function isBoundaryElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  return BOUNDARY_TAGS.has(tagName) || tagName === "section";
}

function findNextNonDidaskaliaSibling(start: Element): Element | null {
  let next = start.nextElementSibling;
  while (next && isDidaskaliaParagraph(next)) {
    next = next.nextElementSibling;
  }
  return next;
}

function isMovableParagraph(element: Element): boolean {
  return element.tagName.toLowerCase() === "p" && !element.hasAttribute("data-speaker");
}

function fixSection(section: Element): boolean {
  let didFix = false;
  let node: Element | null = section.firstElementChild;

  while (node) {
    if (isSpeakerBlock(node)) {
      let cursor = node.nextElementSibling;

      while (cursor) {
        if (isSpeakerBlock(cursor) || isBoundaryElement(cursor)) {
          break;
        }

        if (isDidaskaliaParagraph(cursor)) {
          const nextNonDidaskalia = findNextNonDidaskaliaSibling(cursor);
          if (!nextNonDidaskalia || isSpeakerBlock(nextNonDidaskalia)) {
            break;
          }
          const toMove = cursor;
          cursor = cursor.nextElementSibling;
          node.appendChild(toMove);
          didFix = true;
          continue;
        }

        if (isMovableParagraph(cursor)) {
          const toMove = cursor;
          cursor = cursor.nextElementSibling;
          node.appendChild(toMove);
          didFix = true;
          continue;
        }

        break;
      }
    }

    node = node.nextElementSibling;
  }

  return didFix;
}

export function fixLegacyPlayDidaskalia(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const sections = Array.from(doc.querySelectorAll("section[data-chapter]"));
  const containers = sections.length ? sections : [doc.body];

  let didFix = false;
  for (const section of containers) {
    if (!section.querySelector("div[data-speaker][data-label]")) {
      continue;
    }
    if (fixSection(section)) {
      didFix = true;
    }
  }

  return didFix ? doc.body.innerHTML : html;
}
