export const parseHtmlText = (text: string): { text: string; whitespace: string }[] => {
  const result: { text: string; whitespace: string }[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    // Check if we're at the start of an HTML tag
    if (text[currentIndex] === "<") {
      const tagEndIndex = text.indexOf(">", currentIndex);
      if (tagEndIndex === -1) break; // Invalid HTML, exit

      // Check if this is a self-closing tag or a tag with content
      const tagContent = text.slice(currentIndex, tagEndIndex + 1);
      const isSelfClosing = tagContent.endsWith("/>") || tagContent.match(/<[^>]+\/>/);

      if (isSelfClosing) {
        // Handle self-closing tag
        result.push({ text: tagContent, whitespace: "" });
        currentIndex = tagEndIndex + 1;
      } else {
        // Handle tag with content
        const tagName = tagContent.match(/<([^\s>]+)/)?.[1];
        if (!tagName) {
          currentIndex++;
          continue;
        }

        // Find the closing tag
        const closingTag = `</${tagName}>`;
        const nextClosingTagIndex = text.indexOf(closingTag, tagEndIndex);

        if (nextClosingTagIndex === -1) {
          // If no closing tag found, treat it as a self-closing tag
          result.push({ text: tagContent, whitespace: "" });
          currentIndex = tagEndIndex + 1;
        } else {
          // Include the entire tag with its content
          const fullTag = text.slice(currentIndex, nextClosingTagIndex + closingTag.length);
          result.push({ text: fullTag, whitespace: "" });
          currentIndex = nextClosingTagIndex + closingTag.length;
        }
      }
    } else {
      // Handle regular text
      const nextTagIndex = text.indexOf("<", currentIndex);
      if (nextTagIndex === -1) {
        // No more tags, process remaining text
        const remainingText = text.slice(currentIndex);
        processText(remainingText, result);
        break;
      }

      // Process text up to the next tag
      const textUntilTag = text.slice(currentIndex, nextTagIndex);
      processText(textUntilTag, result);
      currentIndex = nextTagIndex;
    }
  }

  return result;
};

// Helper function to process text and handle punctuation
const processText = (text: string, result: { text: string; whitespace: string }[]): void => {
  // Split text into words and punctuation while preserving whitespace
  const regex = /([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\u0080-\uFFFF]+|[.,!?;:()[\]{}"'\-–—])/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Get the whitespace before this match
    const whitespace = text.slice(lastIndex, match.index);
    result.push({ text: match[0], whitespace });
    lastIndex = match.index + match[0].length;
  }

  // Add any remaining whitespace after the last match
  if (lastIndex < text.length) {
    result.push({ text: "", whitespace: text.slice(lastIndex) });
  }
};

export const joinParsedText = (parsedElements: { text: string; whitespace: string }[]): string => {
  return parsedElements.map((element) => element.whitespace + element.text).join("");
};
