import { DOMParser } from "@xmldom/xmldom";

type OriginalBlock = { openTag: string; closeTag: string; normalizedText: string };

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitInlineParagraphTags(lines: string[]): { lines: string[]; changed: boolean } {
  const result: string[] = [];
  let changed = false;

  for (const line of lines) {
    let remaining = line;
    while (true) {
      const index = remaining.search(/<p\b/i);
      if (index <= 0) {
        result.push(remaining);
        break;
      }

      const prefix = remaining.slice(0, index);
      const rest = remaining.slice(index);
      const prefixTrimmed = prefix.trim();
      const prefixIsWhitespace = prefixTrimmed.length === 0;
      const prefixIsPunctuation =
        prefixTrimmed.length > 0 && /^[“”‘’"'.,;:!?…—–-]+$/.test(prefixTrimmed);

      if (prefixIsWhitespace || prefixIsPunctuation) {
        const openEnd = rest.indexOf(">");
        if (openEnd !== -1) {
          const prefixInside = prefixTrimmed;
          const injected = `${rest.slice(0, openEnd + 1)}${prefixInside}${rest.slice(openEnd + 1)}`;
          result.push(injected);
          if (injected !== line) {
            changed = true;
          }
        } else {
          result.push(rest);
          if (rest !== line) {
            changed = true;
          }
        }
        break;
      }

      result.push(prefix.trimEnd());
      remaining = rest;
      changed = true;
    }
  }

  return { lines: result, changed };
}

function splitInlineParagraphBoundaries(lines: string[]): { lines: string[]; changed: boolean } {
  const result: string[] = [];
  let changed = false;

  for (const line of lines) {
    const rewritten = line.replace(/<\/p>\s+/gi, "</p>\n");

    if (rewritten !== line) {
      changed = true;
    }

    result.push(...rewritten.split("\n"));
  }

  return { lines: result, changed };
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

// eslint-disable-next-line complexity
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
  const boundarySplit = splitInlineParagraphBoundaries(normalizedModel.split(/\r?\n/));
  const splitResult = splitInlineParagraphTags(boundarySplit.lines);
  const lines = splitResult.lines;
  const output: string[] = [];
  let changed = splitResult.changed || boundarySplit.changed;
  let originalIndex = 0;

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    const trimmed = line.trim();

    let prevNonEmptyIndex = i - 1;
    while (prevNonEmptyIndex >= 0 && !lines[prevNonEmptyIndex].trim()) {
      prevNonEmptyIndex -= 1;
    }
    const prevLine = lines[prevNonEmptyIndex] ?? "";

    let nextNonEmptyIndex = i + 1;
    while (nextNonEmptyIndex < lines.length && !lines[nextNonEmptyIndex].trim()) {
      nextNonEmptyIndex += 1;
    }
    const nextLine = lines[nextNonEmptyIndex] ?? "";

    if (!trimmed) {
      output.push(line);
      continue;
    }

    if (trimmed.startsWith("<p") && !trimmed.includes("</p>")) {
      let merged = line;
      let consumedTo = i;
      let foundClose = false;
      let appended = false;

      for (let j = i + 1; j < lines.length; j += 1) {
        const candidate = lines[j];
        const candidateTrimmed = candidate.trim();
        if (!candidateTrimmed) {
          continue;
        }
        if (candidateTrimmed.startsWith("<p") || candidateTrimmed.startsWith("</section>")) {
          break;
        }

        const isBlockBoundary =
          /^(<\/?(section|h\d|hgroup|blockquote|div|ul|ol|li|table|figure)\b)/i.test(
            candidateTrimmed,
          );
        if (isBlockBoundary) {
          break;
        }

        merged = `${merged} ${candidateTrimmed}`;
        appended = true;
        consumedTo = j;
        if (candidateTrimmed.includes("</p>")) {
          foundClose = true;
          break;
        }
      }

      if (appended) {
        if (!foundClose) {
          merged = `${merged}</p>`;
        }
        output.push(merged);
        changed = true;
        i = consumedTo;
        continue;
      }

      const nextTrimmed = nextLine.trim();
      if (
        nextNonEmptyIndex >= lines.length ||
        nextTrimmed.startsWith("<p") ||
        nextTrimmed.startsWith("</section>")
      ) {
        line = `${line}</p>`;
        changed = true;
      }
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

    const prevTrimmed = prevLine.trim();
    const nextTrimmed = nextLine.trim();
    const isIsolatedBetweenParagraphs =
      prevNonEmptyIndex >= 0 &&
      nextNonEmptyIndex < lines.length &&
      prevTrimmed.endsWith("</p>") &&
      nextTrimmed.startsWith("<p");
    if (isIsolatedBetweenParagraphs) {
      const indentMatch = line.match(/^\s*/);
      const indent = indentMatch ? indentMatch[0] : "";
      output.push(`${indent}<p>${lineContent}</p>`);
      changed = true;
      continue;
    }

    output.push(line);
  }

  const joined = output.join("\n");
  if (!changed) return modelInner;
  return modelInner.endsWith("\n") ? `${joined}\n` : joined;
}
