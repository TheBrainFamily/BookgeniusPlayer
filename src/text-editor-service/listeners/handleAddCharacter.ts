export const handleAddCharacter = async (target: HTMLElement, chapterNumber: number, paragraphNumber: number) => {
  const selection = window.getSelection();
  if (!selection) return;

  const selectedText = selection.toString().trim();
  if (selectedText) {
    const paragraphText = target.innerHTML || "";
    // First split by HTML tags
    const parts = paragraphText.split(/(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);

    console.log("11: parts BANG!", parts);

    // Process each part
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

    console.log("16: words BANG!", words);

    const wordIndex = words.findIndex((word) => word === selectedText || word.startsWith(selectedText));

    await fetch(`http://localhost:3000/api/text-editor/add-character`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterNumber, paragraphNumber, characterName: "Zlosliwy-czarodziej", word: words[wordIndex], wordIndex }),
    });
  }
};
