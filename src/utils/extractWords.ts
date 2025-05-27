const processTokens = (text: string): string[] => {
  const tokens = text.split(/(\s+|[.,!?;:()[\]{}"'\-–—])/);
  return tokens.filter((token) => token.trim()).filter((token) => token.match(/[.,!?;:()[\]{}"'\-–—]/) || token.match(/[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/));
};

const extractContentFromTags = (text: string): string => {
  return text.replace(/<[^>]+>/g, "").replace(/<\/[^>]+>/g, "");
};

type ExtractMode = "html" | "xml";

export const extractWords = (text: string, mode: ExtractMode = "html"): string[] => {
  const parts = text.split(/(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);

  return parts
    .filter((part) => part.trim())
    .flatMap((part) => {
      if (part.match(/<[^>]+>.*?<\/[^>]+>|<[^>]+\/>/)) {
        if (mode === "xml") {
          return [part]; // Keep the entire tag as one element
        }
        const content = extractContentFromTags(part);
        return content.trim() ? processTokens(content) : [];
      }
      return processTokens(part);
    });
};
