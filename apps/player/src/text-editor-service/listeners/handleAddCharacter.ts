import { joinParsedText, parseHtmlText } from "@/utils/parseHtmlText";
import { findWordIndices } from "@/utils/findWordIndex";

const getSelectedHtmlContent = (selection: Selection): string => {
  const range = selection.getRangeAt(0);
  const fragment = range.cloneContents();
  const tempDiv = document.createElement("div");
  tempDiv.appendChild(fragment);
  return tempDiv.innerHTML;
};

export const handleAddCharacter = async (target: HTMLElement, chapterNumber: number, paragraphNumber: number, characterSlug: string) => {
  const selection = window.getSelection();
  if (!selection) return;

  const selectedText = selection.toString().trim();

  if (selectedText) {
    const paragraphText = target.innerHTML || "";
    const parsedWords = parseHtmlText(paragraphText.trim());
    const selectedHtmlContent = getSelectedHtmlContent(selection);

    if (/<[^>]*>/.test(selectedHtmlContent)) {
      // TODO: maybe a toast here?
      console.error("The selected text already includes a tag!");
      return;
    }

    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(target);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const selectionStart = preSelectionRange.toString().length;

    const { startIndex, endIndex } = findWordIndices(parsedWords, selectedText, selectionStart);

    const selectedWords = joinParsedText(parsedWords.slice(startIndex, endIndex + 1));

    if (startIndex === -1 || endIndex === -1) {
      // TODO: maybe a toast here?
      console.error("Could not find the selected text in the parsed text");
      return;
    }

    await fetch(`http://localhost:3000/api/text-editor/add-character`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapterNumber,
        paragraphNumber,
        characterName: characterSlug,
        selectedText: selectedWords,
        startSelectedWordIndex: startIndex,
        endSelectedWordIndex: endIndex,
      }),
    });
  }
};
