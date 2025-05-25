import { extractWords } from "@/utils/extractWords";

export const handleAddCharacter = async (target: HTMLElement, chapterNumber: number, paragraphNumber: number) => {
  const selection = window.getSelection();
  if (!selection) return;

  const selectedText = selection.toString().trim();
  if (selectedText) {
    const paragraphText = target.innerHTML || "";
    const words: string[] = extractWords(paragraphText);

    console.log("12: words BANG!", words);

    const selectedWords: string[] = extractWords(selectedText);

    console.log("16: selectedWords BANG!", selectedWords);

    const startSelectedWordIndex = words.findIndex((word) => word === selectedWords[0]);
    const endSelectedWordIndex = selectedWords.length > 1 ? words.findIndex((word) => word === selectedWords[selectedWords.length - 1]) : startSelectedWordIndex;

    await fetch(`http://localhost:3000/api/text-editor/add-character`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterNumber, paragraphNumber, characterName: "Zlosliwy-czarodziej", selectedText, startSelectedWordIndex, endSelectedWordIndex }),
    });
  }
};
