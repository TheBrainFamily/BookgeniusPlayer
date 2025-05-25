export const extractWords = (text: string): string[] => {
  const parts = text.split(/(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);
  const words: string[] = [];

  for (const part of parts) {
    if (part.trim()) {
      if (part.match(/<[^>]+>.*?<\/[^>]+>|<[^>]+\/>/)) {
        words.push(part);
      } else {
        const subParts = part.split(/(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);
        for (const subPart of subParts) {
          if (subPart.trim()) {
            if (subPart.match(/<[^>]+>.*?<\/[^>]+>|<[^>]+\/>/)) {
              words.push(subPart);
            } else {
              // Split by whitespace and preserve punctuation
              const tokens = subPart.split(/(\s+|[.,!?;:()[\]{}"'\-–—])/);
              for (const token of tokens) {
                if (token.trim()) {
                  if (token.match(/[.,!?;:()[\]{}"'\-–—]/)) {
                    // Add punctuation as separate element
                    words.push(token);
                  } else if (token.match(/[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/)) {
                    // Add word if it contains letters
                    words.push(token);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return words;
};
