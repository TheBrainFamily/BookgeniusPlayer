import * as Diff from "diff";
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";

let domParserInitialized = false;

function ensureDomParser(): void {
  if (typeof (globalThis as { DOMParser?: unknown }).DOMParser !== "undefined") return;
  if (domParserInitialized) return;

  const { window } = new JSDOM("");
  (globalThis as { DOMParser: typeof window.DOMParser }).DOMParser = window.DOMParser;
  domParserInitialized = true;
}

function getNormalizedText(htmlString: string): string | null {
  try {
    ensureDomParser();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    if (!doc.body) return null;
    const textContent = doc.body.textContent || "";
    return textContent.replace(/\s+/g, " ").trim();
  } catch (error) {
    console.error("Exception during HTML parsing:", error);
    return null;
  }
}

function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function formatSentenceDiff(originalText: string, editedText: string): string {
  const sentenceDiff = Diff.diffArrays(
    splitIntoSentences(originalText),
    splitIntoSentences(editedText),
  );

  const lines: string[] = [];
  let identicalCount = 0;
  let lastRemoved: string[] | null = null;

  for (const part of sentenceDiff) {
    if (part.removed) {
      if (lastRemoved) {
        if (identicalCount > 0) lines.push(`[... ${identicalCount} identical sentence(s) ...]`);
        identicalCount = 0;
        for (const s of lastRemoved) lines.push(`- ${s}`);
      }
      lastRemoved = part.value as string[];
    } else if (part.added) {
      if (identicalCount > 0) lines.push(`[... ${identicalCount} identical sentence(s) ...]`);
      identicalCount = 0;
      if (lastRemoved) {
        const wordDiff = Diff.diffWords(lastRemoved.join(" "), (part.value as string[]).join(" "));
        let line = "~ ";
        for (const wp of wordDiff) {
          if (wp.added) line += `[+${wp.value}]`;
          else if (wp.removed) line += `[-${wp.value}]`;
          else line += wp.value;
        }
        lines.push(line);
        lastRemoved = null;
      } else {
        for (const s of part.value as string[]) lines.push(`+ ${s}`);
      }
    } else {
      lastRemoved = null;
      identicalCount += part.count || 0;
    }
  }

  if (lastRemoved) {
    if (identicalCount > 0) lines.push(`[... ${identicalCount} identical sentence(s) ...]`);
    for (const s of lastRemoved) lines.push(`- ${s}`);
  } else if (identicalCount > 0) {
    lines.push(`[... ${identicalCount} identical sentence(s) ...]`);
  }

  return lines.join("\n");
}

function printSentenceDiff(originalText: string, editedText: string): void {
  const formatted = formatSentenceDiff(originalText, editedText);
  for (const line of formatted.split("\n")) {
    if (line.startsWith("~ ")) {
      console.log(`  \x1b[33m${line}\x1b[0m`);
    } else if (line.startsWith("- ")) {
      console.log(`  \x1b[31m${line}\x1b[0m`);
    } else if (line.startsWith("+ ")) {
      console.log(`  \x1b[32m${line}\x1b[0m`);
    } else {
      console.log(`  \x1b[90m${line}\x1b[0m`);
    }
  }
}

/**
 * Compares the text content of two XHTML files after stripping markup.
 * Returns null if text is identical, or a diff string describing changes.
 */
export function getTextDiff(originalPath: string, editedPath: string): string | null {
  const originalHtml = readFileSync(originalPath, "utf-8");
  const editedHtml = readFileSync(editedPath, "utf-8");

  const originalText = getNormalizedText(`<section>${originalHtml}</section>`);
  const editedText = getNormalizedText(`<section>${editedHtml}</section>`);

  if (originalText === null || editedText === null) {
    return "Could not parse HTML for text comparison.";
  }

  if (originalText === editedText) return null;

  return formatSentenceDiff(originalText, editedText);
}

/**
 * Verifies that the text content of two XHTML files is identical
 * after stripping all markup. Returns true if text matches.
 */
export function verifyTextInvariance(originalPath: string, editedPath: string): boolean {
  const originalHtml = readFileSync(originalPath, "utf-8");
  const editedHtml = readFileSync(editedPath, "utf-8");

  const originalText = getNormalizedText(`<section>${originalHtml}</section>`);
  const editedText = getNormalizedText(`<section>${editedHtml}</section>`);

  if (originalText === null || editedText === null) {
    console.error("Text verification failed: could not parse HTML.");
    return false;
  }

  if (originalText === editedText) {
    console.log("  Text verified: identical.");
    return true;
  }

  console.log("  Text verification FAILED — differences detected:");
  printSentenceDiff(originalText, editedText);
  return false;
}
