import type { Paragraph } from "../../src/tools/chapterChunker";

const CHARACTER_TAG_REGEX = /<([A-Z][A-Za-z0-9_]+)(\s+talking\s*=\s*"true")?\s*\/>/g;

export function stripCharacterTags(xml: string): string {
  return xml.replace(CHARACTER_TAG_REGEX, "");
}

export function parseXmlToParagraphs(xml: string): { paragraphs: Paragraph[]; chapterId: number } {
  const chapterMatch = xml.match(/<Chapter\s+id\s*=\s*"(\d+)"[^>]*>/i);
  const chapterId = chapterMatch ? parseInt(chapterMatch[1], 10) : 1;

  const paragraphs: Paragraph[] = [];
  let dataIndex = 0;

  const elementRegex = /<(p|h1|h2|h3|h4|h5|h6)>([^<]*(?:<(?!\/?(?:p|h[1-6])>)[^<]*)*)<\/\1>/gi;

  let match: RegExpExecArray | null;
  while ((match = elementRegex.exec(xml)) !== null) {
    const elementType = match[1].toLowerCase();
    let text = match[2];

    text = stripCharacterTags(text).trim();

    if (text.length > 0) {
      paragraphs.push({ text, dataIndex, elementType });
      dataIndex++;
    }
  }

  return { paragraphs, chapterId };
}

export function getChapterIdFromXml(xml: string): number {
  const match = xml.match(/<Chapter\s+id\s*=\s*"(\d+)"[^>]*>/i);
  return match ? parseInt(match[1], 10) : 1;
}
