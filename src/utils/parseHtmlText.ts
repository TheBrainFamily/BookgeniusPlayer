// Types for better code readability
type ParsedElement = { text: string; whitespace: string };

type TagInfo = { tagContent: string; tagEndIndex: number; isSelfClosing: boolean; tagName?: string };

// Helper functions for HTML parsing
const isSelfClosingTag = (tagContent: string): boolean => {
  return tagContent.endsWith("/>") || tagContent.match(/<[^>]+\/>/) !== null;
};

const extractTagName = (tagContent: string): string | undefined => {
  return tagContent.match(/<([^\s>]+)/)?.[1];
};

const findClosingTag = (text: string, tagName: string, startIndex: number): number => {
  const closingTag = `</${tagName}>`;
  return text.indexOf(closingTag, startIndex);
};

// Text processing with clear separation of concerns
const processText = (text: string): ParsedElement[] => {
  const result: ParsedElement[] = [];
  const regex = /([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\u0080-\uFFFF]+|[.,!?;:()[\]{}"'\-–—])/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const whitespace = text.slice(lastIndex, match.index);
    result.push({ text: match[0], whitespace });
    lastIndex = match.index + match[0].length;
  }

  // Handle remaining whitespace
  if (lastIndex < text.length) {
    result.push({ text: "", whitespace: text.slice(lastIndex) });
  }

  return result;
};

// Main parsing function with clear structure
export const parseHtmlText = (text: string): ParsedElement[] => {
  const result: ParsedElement[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    if (text[currentIndex] === "<") {
      const tagEndIndex = text.indexOf(">", currentIndex);
      if (tagEndIndex === -1) break;

      const tagContent = text.slice(currentIndex, tagEndIndex + 1);
      const tagInfo: TagInfo = { tagContent, tagEndIndex, isSelfClosing: isSelfClosingTag(tagContent), tagName: extractTagName(tagContent) };

      if (tagInfo.isSelfClosing) {
        result.push({ text: tagInfo.tagContent, whitespace: "" });
        currentIndex = tagEndIndex + 1;
        continue;
      }

      if (!tagInfo.tagName) {
        currentIndex++;
        continue;
      }

      const nextClosingTagIndex = findClosingTag(text, tagInfo.tagName, tagEndIndex);

      if (nextClosingTagIndex === -1) {
        result.push({ text: tagInfo.tagContent, whitespace: "" });
        currentIndex = tagEndIndex + 1;
      } else {
        const fullTag = text.slice(currentIndex, nextClosingTagIndex + `</${tagInfo.tagName}>`.length);
        result.push({ text: fullTag, whitespace: "" });
        currentIndex = nextClosingTagIndex + `</${tagInfo.tagName}>`.length;
      }
    } else {
      const nextTagIndex = text.indexOf("<", currentIndex);
      if (nextTagIndex === -1) {
        result.push(...processText(text.slice(currentIndex)));
        break;
      }

      result.push(...processText(text.slice(currentIndex, nextTagIndex)));
      currentIndex = nextTagIndex;
    }
  }

  return result;
};

export const joinParsedText = (parsedElements: ParsedElement[]): string => {
  return parsedElements.map((element) => element.whitespace + element.text).join("");
};
