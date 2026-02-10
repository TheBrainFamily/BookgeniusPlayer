import { ensureDomParser } from "../../lib/domParser";
import { getParagraphsFromChapterWithText } from "../getParagraphsFromChapterWithText";
import { getChapterTitle } from "./get-chapter-title";
import * as cheerio from "cheerio";

const escapeXml = (str: string) =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const isElement = (node: Node): node is Element => node.nodeType === 1; /* ELEMENT_NODE */

function collectChapterElements(root: Element): Map<number, Element> {
  const byNumber = new Map<number, Element>();

  const stack: Node[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (isElement(node)) {
      const dataChapter = node.getAttribute("data-chapter");
      if (dataChapter) {
        const n = parseInt(dataChapter, 10);
        if (!Number.isNaN(n)) {
          if (!byNumber.has(n)) byNumber.set(n, node);
        }
      }
      // push children
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = node.childNodes.item(i);
        if (child) {
          stack.push(child);
        }
      }
    }
  }
  return byNumber;
}

export function generateChaptersXmlFromRich(bookText: string): string {
  ensureDomParser();
  const parser = new DOMParser();
  const doc = parser.parseFromString(bookText, "text/html");
  const root = doc.documentElement;

  if (!root) {
    throw new Error("Invalid rich.xml: missing documentElement");
  }

  const chaptersMap = collectChapterElements(root);

  if (chaptersMap.size === 0) {
    throw new Error(
      "rich.xml does not contain any elements with data-chapter. The file is invalid.",
    );
  }

  const chapterNumbers = Array.from(chaptersMap.keys()).sort((a, b) => a - b);
  // Validate consecutiveness starting from 1
  for (let i = 0; i < chapterNumbers.length; i++) {
    if (chapterNumbers[i] !== i + 1) {
      throw new Error(
        `rich.xml data-chapter numbering must be consecutive starting at 1. Found ${chapterNumbers[i]} at position ${i + 1}.`,
      );
    }
  }

  const $ = cheerio.load(bookText);
  const chapterEntries = chapterNumbers.map((ch) => {
    const chapterElement = chaptersMap.get(ch)!;
    const title = getChapterTitle(chapterElement) || "";
    const paragraphs = getParagraphsFromChapterWithText(ch, bookText, true, true, $);
    const content = paragraphs.map((p) => p.text).join("\n");
    const result = `<chapter number="${ch}"><title>${escapeXml(title)}</title><content>${escapeXml(content)}</content></chapter>`;
    return result;
  });

  const result = `<chapters>\n${chapterEntries.join("\n")}\n</chapters>`;

  return result;
}
