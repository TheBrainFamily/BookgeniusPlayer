import { parseHtmlText } from "@/utils/parseHtmlText";

interface ParsedWord {
  text: string;
  whitespace: string;
}

interface WordIndices {
  startIndex: number;
  endIndex: number;
}

const isPartialMatch = (partial: string, full: string): boolean => {
  // If the partial text is longer than the full text, it's not a match
  if (partial.length > full.length) return false;

  // If the partial text is at least 3 characters and is contained within the full text
  if (partial.length >= 3 && full.includes(partial)) return true;

  // If the partial text is at the start of the full text
  if (full.startsWith(partial)) return true;

  // If the partial text is at the end of the full text
  if (full.endsWith(partial)) return true;

  return false;
};

export const findWordIndices = (parsedWords: ParsedWord[], selectedText: string, selectionStart: number): WordIndices => {
  // Parse the selected text the same way as the paragraph
  const selectedParsedWords = parseHtmlText(selectedText);

  // Find all possible starting positions using fuzzy matching
  const possibleStarts: { index: number; distance: number }[] = [];
  parsedWords.forEach((word, index) => {
    const cleanWord = word.text.replace(/<[^>]*>/g, "");
    const firstSelectedWord = selectedParsedWords[0].text;

    // Try exact match first
    if (cleanWord === firstSelectedWord) {
      possibleStarts.push({ index, distance: Math.abs(selectionStart - index) });
    }
    // If no exact match, try partial match
    else if (isPartialMatch(firstSelectedWord, cleanWord)) {
      possibleStarts.push({ index, distance: Math.abs(selectionStart - index) });
    }
  });

  if (possibleStarts.length === 0) {
    return { startIndex: -1, endIndex: -1 };
  }

  // Sort possible starts by their distance to the selection start
  possibleStarts.sort((a, b) => a.distance - b.distance);

  // For each possible start, check if the following words match
  for (const { index: startIndex } of possibleStarts) {
    let matches = true;
    let currentIndex = startIndex;
    let endIndex = startIndex;

    // Check each word in the selection
    for (let i = 0; i < selectedParsedWords.length; i++) {
      const selectedWord = selectedParsedWords[i].text;
      const parsedWord = parsedWords[currentIndex]?.text.replace(/<[^>]*>/g, "");

      if (!parsedWord) {
        matches = false;
        break;
      }

      // Try exact match first
      if (parsedWord === selectedWord) {
        endIndex = currentIndex;
        currentIndex++;
        continue;
      }

      // If no exact match, try partial match
      if (isPartialMatch(selectedWord, parsedWord)) {
        endIndex = currentIndex;
        currentIndex++;
        continue;
      }

      // If we're at the last word of the selection, try to find a word that contains it
      if (i === selectedParsedWords.length - 1) {
        let found = false;
        // Look ahead up to 2 words to find a match
        for (let j = 0; j < 2; j++) {
          const nextWord = parsedWords[currentIndex + j]?.text.replace(/<[^>]*>/g, "");
          if (nextWord && isPartialMatch(selectedWord, nextWord)) {
            endIndex = currentIndex + j;
            found = true;
            break;
          }
        }
        if (found) continue;
      }

      matches = false;
      break;
    }

    if (matches) {
      return { startIndex, endIndex };
    }
  }

  // If no match found, return -1 for both indices
  return { startIndex: -1, endIndex: -1 };
};
