import { parseHtmlText } from "@/utils/parseHtmlText";
import { findWordIndices } from "@/utils/findWordIndex";

export const handleAddCharacter = async (target: HTMLElement, chapterNumber: number, paragraphNumber: number, characterSlug: string) => {
  const selection = window.getSelection();
  if (!selection) return;

  const selectedText = selection.toString().trim();

  if (selectedText) {
    const paragraphText = target.innerHTML || "";
    const parsedWords = parseHtmlText(paragraphText);

    console.log("14: selectedText BANG!", selectedText);

    console.log("14: parsedWords BANG!", parsedWords);

    // Get the selection start position relative to the paragraph
    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(target);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const selectionStart = preSelectionRange.toString().length;

    const { startIndex, endIndex } = findWordIndices(parsedWords, selectedText, selectionStart);
    console.log("24: indices BANG!", { startIndex, endIndex });

    if (startIndex === -1 || endIndex === -1) {
      console.error("Could not find the selected text in the parsed text");
      return;
    }

    await fetch(`http://localhost:3000/api/text-editor/add-character`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterNumber, paragraphNumber, characterName: characterSlug, selectedText, startSelectedWordIndex: startIndex, endSelectedWordIndex: endIndex }),
    });
  }
};
