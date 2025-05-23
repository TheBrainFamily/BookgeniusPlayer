export const handleAddCharacter = async (target: HTMLElement, chapterNumber: number, paragraphNumber: number) => {
  const selection = window.getSelection();
  if (!selection) return;

  const selectedText = selection.toString().trim();
  if (selectedText) {
    const paragraphText = target.textContent || "";
    // Split by whitespace and filter out empty strings and special characters
    const words = paragraphText.split(/\s+/).filter((word) => word.length > 0 && /[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(word));

    const wordIndex = words.findIndex((word) => word === selectedText || word.startsWith(selectedText));

    await fetch(`http://localhost:3000/api/text-editor/add-character`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterNumber, paragraphNumber, characterName: "Zlosliwy-czarodziej", word: words[wordIndex], wordIndex }),
    });
  }
};
