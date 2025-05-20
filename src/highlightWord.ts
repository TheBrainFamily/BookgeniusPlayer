/**
 * Highlights the Nth occurrence of a word within an HTML string.
 * If the found word is directly inside an existing SPAN, that entire existing SPAN is
 * wrapped by a new, temporary highlight SPAN.
 * Otherwise, a new temporary SPAN is created to wrap only the specific word.
 * Manages temporary highlights and aims to preserve existing structure.
 *
 * @param htmlText The HTML string to search within.
 * @param wordToFind The word to search for.
 * @param occurrenceIndex The 0-based index of the occurrence to highlight.
 * @param className The primary CSS class for the highlight (e.g., "current-word").
 * @param isLastWordInParagraph Optional. If true, an additional class 'last-word-auto-fade' is added for timed visual effect.
 * @returns The modified HTML string.
 */
export function highlightNthOccurrence(htmlText: string, wordToFind: string, occurrenceIndex: number, className: string = "current-word", isLastWordInParagraph?: boolean): string {
  if (!wordToFind || !htmlText) {
    return htmlText;
  }

  const tempDiv: HTMLDivElement = document.createElement("div");
  tempDiv.innerHTML = htmlText;

  // Constants for classes and markers
  const primaryHighlightClass = className.split(" ")[0];
  const FADE_CLASS = "last-word-auto-fade";
  const GENERATED_SPAN_MARKER = "data-highlight-generated";

  // Helper function to check if a character is a word character
  const isWordChar = (char: string): boolean => {
    if (!char || char.length !== 1) return false;
    return /^[a-zA-Z0-9À-ÖØ-öø-ÿĄĆĘŁŃÓŚŹŻąćęłńóśźż_]$/.test(char);
  };

  // Helper function to decode HTML entities
  const decodeHtmlEntities = (text: string): string => {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  };

  // Helper function to clean up existing highlights
  const cleanupExistingHighlights = () => {
    const elementsWithHighlight: NodeListOf<HTMLElement> = tempDiv.querySelectorAll(`.${primaryHighlightClass}`);
    elementsWithHighlight.forEach((el) => {
      const wasGeneratedByUs = el.getAttribute(GENERATED_SPAN_MARKER) === "true";

      el.classList.remove(primaryHighlightClass);
      el.classList.remove(FADE_CLASS);

      if (wasGeneratedByUs) {
        const parent = el.parentNode;
        if (parent) {
          if (el.childNodes.length === 1 && el.firstChild && el.firstChild.nodeType === Node.ELEMENT_NODE) {
            parent.insertBefore(el.firstChild, el);
          } else {
            while (el.firstChild) {
              parent.insertBefore(el.firstChild, el);
            }
          }
          parent.removeChild(el);
          if (typeof parent.normalize === "function") {
            parent.normalize();
          }
        }
      }
    });
  };

  // Helper function to collect text nodes
  const collectTextNodes = (): Text[] => {
    const nodesToProcess: Text[] = [];
    const walker: TreeWalker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
    let currentNodeFromWalker: Node | null;
    while ((currentNodeFromWalker = walker.nextNode())) {
      if (currentNodeFromWalker.nodeType === Node.TEXT_NODE && currentNodeFromWalker.nodeValue && currentNodeFromWalker.nodeValue.trim() !== "") {
        nodesToProcess.push(currentNodeFromWalker as Text);
      }
    }
    return nodesToProcess;
  };

  // Helper function to create highlight span
  const createHighlightSpan = (text: string): HTMLSpanElement => {
    const newSpan: HTMLSpanElement = document.createElement("span");
    newSpan.className = primaryHighlightClass;
    if (isLastWordInParagraph) {
      //TODO: be sure that we want to fade out the last word in a paragraph like this
      newSpan.classList.add(FADE_CLASS);
    }
    newSpan.setAttribute(GENERATED_SPAN_MARKER, "true");
    newSpan.textContent = text;
    return newSpan;
  };

  // Helper function to wrap existing span
  const wrapExistingSpan = (parentElement: HTMLElement): boolean => {
    const grandParentElement = parentElement.parentNode;
    if (!grandParentElement) return false;

    const newHighlightWrapperSpan = document.createElement("span");
    newHighlightWrapperSpan.className = primaryHighlightClass;
    if (isLastWordInParagraph) {
      newHighlightWrapperSpan.classList.add(FADE_CLASS);
    }
    newHighlightWrapperSpan.setAttribute(GENERATED_SPAN_MARKER, "true");
    grandParentElement.insertBefore(newHighlightWrapperSpan, parentElement);
    newHighlightWrapperSpan.appendChild(parentElement);
    return true;
  };

  // Helper function to wrap word in text node
  const wrapWordInTextNode = (textNode: Text, startIndex: number, wordLength: number): boolean => {
    const parentElement = textNode.parentNode as HTMLElement | null;
    if (!parentElement) return false;

    const nodeText = textNode.nodeValue || "";
    const textBeforeVal = nodeText.substring(0, startIndex);
    const textAfterVal = nodeText.substring(startIndex + wordLength);
    const actualFoundWordInText = nodeText.substring(startIndex, startIndex + wordLength);

    const newSpan = createHighlightSpan(actualFoundWordInText);

    if (textBeforeVal.length > 0) {
      parentElement.insertBefore(document.createTextNode(textBeforeVal), textNode);
    }
    parentElement.insertBefore(newSpan, textNode);
    if (textAfterVal.length > 0) {
      parentElement.insertBefore(document.createTextNode(textAfterVal), textNode);
    }
    parentElement.removeChild(textNode);
    if (typeof parentElement.normalize === "function") {
      parentElement.normalize();
    }
    return true;
  };

  // Main processing logic
  const processTextNodes = (): boolean => {
    const nodesToProcess = collectTextNodes();
    const decodedWordToFind = decodeHtmlEntities(wordToFind);
    let currentTextMatchCount = 0;

    for (const textNode of nodesToProcess) {
      const nodeText = textNode.nodeValue || "";
      const LcNodeText = nodeText;
      const LcWordToFind = decodedWordToFind;

      if (LcWordToFind.length === 0) continue;

      let searchIndexInLcText = 0;
      while (searchIndexInLcText < LcNodeText.length) {
        const matchStartIndexInLcText = LcNodeText.indexOf(LcWordToFind, searchIndexInLcText);
        if (matchStartIndexInLcText === -1) break;

        const charBefore = matchStartIndexInLcText > 0 ? nodeText[matchStartIndexInLcText - 1] : " ";
        const charAfter = matchStartIndexInLcText + LcWordToFind.length < nodeText.length ? nodeText[matchStartIndexInLcText + LcWordToFind.length] : " ";

        if (!isWordChar(charBefore) && !isWordChar(charAfter)) {
          if (currentTextMatchCount === occurrenceIndex) {
            const parentElement = textNode.parentNode as HTMLElement | null;
            if (parentElement && parentElement.nodeName === "SPAN" && parentElement.parentNode && !parentElement.hasAttribute(GENERATED_SPAN_MARKER)) {
              return wrapExistingSpan(parentElement);
            } else if (parentElement) {
              return wrapWordInTextNode(textNode, matchStartIndexInLcText, LcWordToFind.length);
            }
          }
          currentTextMatchCount++;
        }
        searchIndexInLcText = matchStartIndexInLcText + LcWordToFind.length;
      }
    }
    return false;
  };

  // Execute the main logic
  cleanupExistingHighlights();
  processTextNodes();
  return tempDiv.innerHTML;
}
