export const handleAddCharacter = async (target: HTMLElement, chapterNumber: number, paragraphNumber: number) => {
  const selection = window.getSelection();
  if (!selection) return;

  const selectedText = selection.toString().trim();
  if (selectedText) {
    const paragraphText = target.innerHTML || "";
    // First split by HTML tags
    const parts = paragraphText.split(/(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);

    // Process each part
    const words: string[] = [];
    for (const part of parts) {
      if (part.trim()) {
        if (part.match(/<[^>]+>.*?<\/[^>]+>|<[^>]+\/>/)) {
          // Keep the tag
          words.push(part);
        } else {
          // Process regular text, but first split by potential attached tags
          const subParts = part.split(/(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);
          for (const subPart of subParts) {
            if (subPart.trim()) {
              if (subPart.match(/<[^>]+>.*?<\/[^>]+>|<[^>]+\/>/)) {
                words.push(subPart);
              } else {
                words.push(
                  ...subPart
                    .split(/\s+/)
                    .map((w) => w.replace(/[.,!?;:()[\]{}"'\-–—]/g, ""))
                    .filter((w) => w.length > 0 && /[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(w)),
                );
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
