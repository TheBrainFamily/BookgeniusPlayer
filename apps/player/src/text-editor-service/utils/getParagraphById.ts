//TODO: worth to think about using cheerio

export const getParagraphById = (paragraphId: number | string, editorContent: string): string | null => {
  // First try to find by span ID if paragraphId is a string
  if (typeof paragraphId === "string") {
    const spanPattern = new RegExp(`<span id="${paragraphId}"[^>]*>.*?</span>`, "i");
    const spanMatch = editorContent.match(spanPattern);

    if (spanMatch) {
      return spanMatch[0]; // Return entire span with tags
    }

    // If span ID not found, extract paragraph number from span ID
    const paragraphFromSpanId = paragraphId.match(/p(\d+)/)?.[1];
    if (paragraphFromSpanId) {
      const extractedParagraphNumber = parseInt(paragraphFromSpanId);
      return getParagraphByIndex(extractedParagraphNumber, editorContent);
    }
  }

  // If paragraphId is a number, use element counting
  if (typeof paragraphId === "number") {
    return getParagraphByIndex(paragraphId, editorContent);
  }

  return null;
};

const getParagraphByIndex = (paragraphNumber: number, editorContent: string): string | null => {
  // Find Chapter content
  const chapterPattern = /<Chapter[^>]*>(.*?)<\/Chapter>/is;
  const chapterMatch = editorContent.match(chapterPattern);

  if (!chapterMatch) {
    return null;
  }

  const chapterContent = chapterMatch[1];

  // Find all direct child elements
  const childElementPattern = /<(p|blockquote|h[1-6]|div|span|section|article|aside|figure|table|dialogue|stage-direction|verse)[^>]*>.*?<\/\1>/gi;
  const matches = [...chapterContent.matchAll(childElementPattern)];

  if (paragraphNumber < 0 || paragraphNumber >= matches.length) {
    return null;
  }

  // Return the entire element with all HTML tags
  return matches[paragraphNumber][0];
};
