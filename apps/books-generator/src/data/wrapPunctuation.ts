export const wrapPunctuationAdvanced = (html: string) => {
  if (html.includes("text-nowrap")) {
    return html;
  }

  const lines = html.split("\n");
  const processedLines = lines.map((line) => wrapPunctuationInLine(line));
  return processedLines.join("\n");
};

const wrapPunctuationInLine = (line: string): string => {
  // Skip lines that already contain text-nowrap
  if (line.includes("text-nowrap")) {
    return line;
  }

  // First, handle the new case: HTML tag immediately followed by punctuation
  // Pattern: <span...>content</span> followed by punctuation
  const htmlWithPunctuationRegex = /(<span[^>]*>[^<]+<\/span>)([^\w\s<>&]+)/g;
  const result = line.replace(htmlWithPunctuationRegex, '<span class="text-nowrap">$1$2</span>');

  // If we made changes in the first step, return the result
  if (result !== line) {
    return result;
  }

  // Look for lines ending with </span>
  if (!line.endsWith("</span>")) {
    return line;
  }

  // Pattern: look for </span> followed by punctuation followed by </span> at end
  // This regex captures: (</span>)(punctuation)(</span>)
  const regex = /(<\/span>)([^\w\s<>&]+)(<\/span>)$/;
  const match = line.match(regex);

  if (!match) {
    return line;
  }

  const [fullMatch, firstClosingSpan, punctuation, lastClosingSpan] = match;
  const beforeMatch = line.substring(0, line.length - fullMatch.length);

  // Find the span that should be wrapped - look for the last <span> before the punctuation
  // We need to find the opening <span> that corresponds to the first </span>
  let spanOpeningIndex = -1;
  let depth = 0;

  // Walk backwards from the first </span> to find its matching opening <span>
  for (let i = beforeMatch.length - 1; i >= 0; i--) {
    if (beforeMatch.substring(i).startsWith("</span>")) {
      depth++;
      i -= 6; // skip past </span>
    } else if (beforeMatch.substring(i).startsWith("<span")) {
      if (depth === 0) {
        spanOpeningIndex = i;
        break;
      }
      depth--;
      // Find the end of this span tag
      while (i > 0 && beforeMatch[i] !== ">") {
        i--;
      }
    }
  }

  if (spanOpeningIndex === -1) {
    return line;
  }

  const beforeSpanToWrap = beforeMatch.substring(0, spanOpeningIndex);
  const spanToWrap = beforeMatch.substring(spanOpeningIndex) + firstClosingSpan;

  // Construct the result with text-nowrap wrapper
  return `${beforeSpanToWrap}<span class="text-nowrap">${spanToWrap}${punctuation}${lastClosingSpan}</span>`;
};
