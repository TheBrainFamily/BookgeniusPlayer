import { extractWords } from "@/utils/extractWords";

export const handleAddCharacter = async (target: HTMLElement, chapterNumber: number, paragraphNumber: number, characterSlug: string) => {
  console.log("5: characterSlug BANG!", characterSlug);

  const selection = window.getSelection();
  if (!selection) return;

  const selectedText = selection.toString().trim();
  if (selectedText) {
    const paragraphText = target.innerHTML || "";
    const words: string[] = extractWords(paragraphText);

    const selectedWords: string[] = extractWords(selectedText);

    const startSelectedWordIndex = words.findIndex((word) => word === selectedWords[0]);
    const endSelectedWordIndex = selectedWords.length > 1 ? words.findIndex((word) => word === selectedWords[selectedWords.length - 1]) : startSelectedWordIndex;

    await fetch(`http://localhost:3000/api/text-editor/add-character`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterNumber, paragraphNumber, characterName: characterSlug, selectedText, startSelectedWordIndex, endSelectedWordIndex }),
    });
  }
};
