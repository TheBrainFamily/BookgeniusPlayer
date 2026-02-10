import { ensureDomParser } from "../../lib/domParser";

type OriginalBlock = { element: Element; tagName: string; normalizedText: string };

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function getElementAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!element.attributes) return attrs;
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes.item(i);
    if (attr?.name) {
      attrs[attr.name] = attr.value ?? "";
    }
  }
  return attrs;
}

function buildAttributeString(attributes: Record<string, string>): string {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return "";
  return " " + entries.map(([key, value]) => `${key}="${value.replace(/"/g, "&quot;")}"`).join(" ");
}

function stripXmlns(serialized: string): string {
  return serialized.replace(/\s+xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, "");
}

function serializeNodes(nodes: ChildNode[], serializer: XMLSerializer): string {
  return nodes.map((node) => stripXmlns(serializer.serializeToString(node))).join("");
}

function extractOriginalBlocks(section: Element): OriginalBlock[] {
  const blocks: OriginalBlock[] = [];
  for (let i = 0; i < section.childNodes.length; i++) {
    const node = section.childNodes[i];
    if (node.nodeType !== node.ELEMENT_NODE) continue;
    const element = node as Element;
    const tagName = (element.tagName || "").toLowerCase();
    const normalizedText = normalizeText(element.textContent || "");
    blocks.push({ element, tagName, normalizedText });
  }
  return blocks;
}

function findMatchingOriginalIndex(
  blocks: OriginalBlock[],
  startIndex: number,
  normalizedText: string,
): number {
  if (!normalizedText) return -1;
  for (let i = startIndex; i < blocks.length; i++) {
    if (blocks[i].normalizedText === normalizedText) {
      return i;
    }
  }
  return -1;
}

function wrapDanglingNodes(
  originalElement: Element,
  danglingNodes: ChildNode[],
  serializer: XMLSerializer,
): string {
  const tagName = (originalElement.tagName || "").toLowerCase();
  const attrs = buildAttributeString(getElementAttributes(originalElement));
  const inner = serializeNodes(danglingNodes, serializer);
  return `<${tagName}${attrs}>${inner}</${tagName}>`;
}

export function restoreUnwrappedBlocks(originalHtml: string, modelHtml: string): string {
  if (originalHtml === modelHtml) return modelHtml;

  ensureDomParser();
  const parser = new DOMParser();
  const originalDoc = parser.parseFromString(`<section>${originalHtml}</section>`, "text/html");
  const modelDoc = parser.parseFromString(`<section>${modelHtml}</section>`, "text/html");

  const originalSection = originalDoc.getElementsByTagName("section")[0];
  const modelSection = modelDoc.getElementsByTagName("section")[0];
  if (!originalSection || !modelSection) return modelHtml;

  const originalBlocks = extractOriginalBlocks(originalSection);
  if (originalBlocks.length === 0) return modelHtml;

  const allowedTags = new Set(originalBlocks.map((block) => block.tagName));
  const serializer = new XMLSerializer();

  const output: string[] = [];
  let danglingNodes: ChildNode[] = [];
  let changed = false;
  let originalIndex = 0;

  const flushDangling = () => {
    if (danglingNodes.length === 0) return;

    const danglingText = normalizeText(
      danglingNodes.map((node) => node.textContent || "").join(""),
    );
    const matchIndex = findMatchingOriginalIndex(originalBlocks, originalIndex, danglingText);

    if (matchIndex >= 0) {
      output.push(wrapDanglingNodes(originalBlocks[matchIndex].element, danglingNodes, serializer));
      originalIndex = matchIndex + 1;
      changed = true;
    } else {
      output.push(serializeNodes(danglingNodes, serializer));
    }

    danglingNodes = [];
  };

  for (let i = 0; i < modelSection.childNodes.length; i++) {
    const node = modelSection.childNodes[i];

    if (node.nodeType === node.TEXT_NODE) {
      const text = node.nodeValue ?? "";
      if (normalizeText(text) === "") {
        continue;
      }
      danglingNodes.push(node);
      continue;
    }

    if (node.nodeType === node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = (element.tagName || "").toLowerCase();

      if (!allowedTags.has(tagName)) {
        danglingNodes.push(node);
        continue;
      }

      flushDangling();

      // Keep valid block element as-is
      output.push(stripXmlns(serializer.serializeToString(element)));

      const elementText = normalizeText(element.textContent || "");
      const matchIndex = findMatchingOriginalIndex(originalBlocks, originalIndex, elementText);
      if (matchIndex >= 0) {
        originalIndex = matchIndex + 1;
      }
      continue;
    }
  }

  flushDangling();

  if (!changed) return modelHtml;
  return output.join("");
}
