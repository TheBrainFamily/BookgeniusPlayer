export const extractWords = (text: string): string[] => {
  const parts = text.split(/(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);
  const words: string[] = [];

  for (const part of parts) {
    if (part.trim()) {
      if (part.match(/<[^>]+>.*?<\/[^>]+>|<[^>]+\/>/)) {
        // Extract text content between tags
        const content = part.replace(/<[^>]+>/g, "").replace(/<\/[^>]+>/g, "");
        if (content.trim()) {
          // Split by whitespace and preserve punctuation
          const tokens = content.split(/(\s+|[.,!?;:()[\]{}"'\-–—])/);
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
      } else {
        // Split by whitespace and preserve punctuation
        const tokens = part.split(/(\s+|[.,!?;:()[\]{}"'\-–—])/);
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
  return words;
};
