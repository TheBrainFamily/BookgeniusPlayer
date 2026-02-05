import { DOMParser } from "@xmldom/xmldom";

type OriginalBlock = { openTag: string; closeTag: string; normalizedText: string };

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function getTextContent(html: string, parser: DOMParser): string {
  const doc = parser.parseFromString(`<p>${html}</p>`, "text/html");
  const p = doc.getElementsByTagName("p")[0];
  return p?.textContent ?? "";
}

function extractOriginalBlocks(originalInner: string): OriginalBlock[] {
  const parser = new DOMParser();
  const blocks: OriginalBlock[] = [];
  const lines = originalInner.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("<p")) continue;

    const openEnd = trimmed.indexOf(">");
    const closeStart = trimmed.lastIndexOf("</p>");
    if (openEnd === -1 || closeStart === -1 || closeStart <= openEnd) continue;

    const openTag = trimmed.slice(0, openEnd + 1);
    const innerHtml = trimmed.slice(openEnd + 1, closeStart);
    const normalizedText = normalizeText(getTextContent(innerHtml, parser));

    blocks.push({ openTag, closeTag: "</p>", normalizedText });
  }

  return blocks;
}

function findMatchingIndex(
  blocks: OriginalBlock[],
  startIndex: number,
  normalizedText: string,
): number {
  if (!normalizedText) return -1;
  for (let i = startIndex; i < blocks.length; i += 1) {
    if (blocks[i].normalizedText === normalizedText) return i;
  }
  return -1;
}

export function restoreUnwrappedLines(originalInner: string, modelInner: string): string {
  if (originalInner === modelInner) return modelInner;

  const blocks = extractOriginalBlocks(originalInner);
  if (blocks.length === 0) return modelInner;

  const parser = new DOMParser();
  let normalizedModel = modelInner.includes("\n")
    ? modelInner
    : modelInner.replace(/<\/p>\s*/gi, "</p>\n").replace(/\s*<p\b/gi, "\n<p");
  if (!modelInner.includes("\n")) {
    normalizedModel = normalizedModel.replace(/^\n+/, "").replace(/\n+$/, "");
  }
  const lines = normalizedModel.split(/\r?\n/);
  const output: string[] = [];
  let changed = false;
  let originalIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      output.push(line);
      continue;
    }

    if (trimmed.startsWith("<")) {
      output.push(line);
      continue;
    }

    let lineContent = trimmed;
    const closingPMatch = lineContent.match(/<\/p>\s*$/i);
    if (closingPMatch) {
      lineContent = lineContent.slice(0, closingPMatch.index).trimEnd();
    }

    const normalizedText = normalizeText(getTextContent(lineContent, parser));
    const matchIndex = findMatchingIndex(blocks, originalIndex, normalizedText);

    if (matchIndex >= 0) {
      const indentMatch = line.match(/^\s*/);
      const indent = indentMatch ? indentMatch[0] : "";
      const block = blocks[matchIndex];
      output.push(`${indent}${block.openTag}${lineContent}${block.closeTag}`);
      originalIndex = matchIndex + 1;
      changed = true;
      continue;
    }

    output.push(line);
  }

  const joined = output.join("\n");
  if (!changed) return modelInner;
  return modelInner.endsWith("\n") ? `${joined}\n` : joined;
}
