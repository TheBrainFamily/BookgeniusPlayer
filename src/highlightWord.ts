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

  // --- 1. Cleanup Logic ---
  const elementsWithHighlight: NodeListOf<HTMLElement> = tempDiv.querySelectorAll(`.${primaryHighlightClass}`);
  elementsWithHighlight.forEach((el) => {
    const wasGeneratedByUs = el.getAttribute(GENERATED_SPAN_MARKER) === "true";

    el.classList.remove(primaryHighlightClass);
    el.classList.remove(FADE_CLASS);

    if (wasGeneratedByUs) {
      const parent = el.parentNode;
      if (parent) {
        // If the highlight wrapper contains a single element (e.g., a span), unwrap it cleanly
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
  // --- End of Cleanup Logic ---

  let currentTextMatchCount: number = 0;
  let highlighted: boolean = false;

  const walker: TreeWalker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
  const nodesToProcess: Text[] = [];
  let currentNodeFromWalker: Node | null;
  while ((currentNodeFromWalker = walker.nextNode())) {
    if (currentNodeFromWalker.nodeType === Node.TEXT_NODE && currentNodeFromWalker.nodeValue && currentNodeFromWalker.nodeValue.trim() !== "") {
      nodesToProcess.push(currentNodeFromWalker as Text);
    }
  }

  const isWordChar = (char: string): boolean => {
    if (!char || char.length !== 1) return false;
    return /^[a-zA-Z0-9À-ÖØ-öø-ÿĄĆĘŁŃÓŚŹŻąćęłńóśźż_]$/.test(char);
  };

  // Decode HTML entities in wordToFind for comparison
  const decodedWordToFind = wordToFind
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  for (let i = 0; i < nodesToProcess.length; i++) {
    if (highlighted) break;

    const textNodeToSearch: Text = nodesToProcess[i];
    const nodeText: string = textNodeToSearch.nodeValue || "";
    const LcNodeText = nodeText.toLowerCase();
    const LcWordToFind = decodedWordToFind.toLowerCase();

    if (LcWordToFind.length === 0) continue;

    let searchIndexInLcText = 0;

    while (searchIndexInLcText < LcNodeText.length) {
      const matchStartIndexInLcText = LcNodeText.indexOf(LcWordToFind, searchIndexInLcText);
      if (matchStartIndexInLcText === -1) break;

      const matchStartIndexInOriginalText = matchStartIndexInLcText;
      const actualFoundWordInText = nodeText.substring(matchStartIndexInOriginalText, matchStartIndexInOriginalText + LcWordToFind.length);

      const charBefore = matchStartIndexInOriginalText > 0 ? nodeText[matchStartIndexInOriginalText - 1] : " ";
      const charAfter = matchStartIndexInOriginalText + LcWordToFind.length < nodeText.length ? nodeText[matchStartIndexInOriginalText + LcWordToFind.length] : " ";

      if (!isWordChar(charBefore) && !isWordChar(charAfter)) {
        // DEBUG LOG
         
        console.log("DEBUG:", { currentTextMatchCount, occurrenceIndex, nodeText, matchStartIndexInLcText, actualFoundWordInText });
        if (currentTextMatchCount === occurrenceIndex) {
          const parentElement = textNodeToSearch.parentNode as HTMLElement | null;

          // If the match's parent is a <span>, wrap the <span>. Otherwise, just wrap the word itself.
          if (parentElement && parentElement.nodeName === "SPAN" && parentElement.parentNode && !parentElement.hasAttribute(GENERATED_SPAN_MARKER)) {
            const grandParentElement = parentElement.parentNode;
            const newHighlightWrapperSpan = document.createElement("span");
            newHighlightWrapperSpan.className = primaryHighlightClass;
            if (isLastWordInParagraph) {
              newHighlightWrapperSpan.classList.add(FADE_CLASS);
            }
            newHighlightWrapperSpan.setAttribute(GENERATED_SPAN_MARKER, "true");
            grandParentElement.insertBefore(newHighlightWrapperSpan, parentElement);
            newHighlightWrapperSpan.appendChild(parentElement);
            highlighted = true;
            break;
          } else if (parentElement) {
            // Create a new SPAN for this specific word segment
            const textBeforeVal: string = nodeText.substring(0, matchStartIndexInOriginalText);
            const textAfterVal: string = nodeText.substring(matchStartIndexInOriginalText + actualFoundWordInText.length);

            const newSpan: HTMLSpanElement = document.createElement("span");
            newSpan.className = primaryHighlightClass;
            if (isLastWordInParagraph) {
              newSpan.classList.add(FADE_CLASS);
            }
            newSpan.setAttribute(GENERATED_SPAN_MARKER, "true");
            newSpan.textContent = actualFoundWordInText;

            if (textBeforeVal.length > 0) {
              parentElement.insertBefore(document.createTextNode(textBeforeVal), textNodeToSearch);
            }
            parentElement.insertBefore(newSpan, textNodeToSearch);
            if (textAfterVal.length > 0) {
              parentElement.insertBefore(document.createTextNode(textAfterVal), textNodeToSearch);
            }
            parentElement.removeChild(textNodeToSearch);
            if (typeof parentElement.normalize === "function") {
              parentElement.normalize();
            }
            highlighted = true;
            break;
          }
        }
        currentTextMatchCount++;
      }
      searchIndexInLcText = matchStartIndexInLcText + LcWordToFind.length;
    }
    if (highlighted) break;
  }
  return tempDiv.innerHTML;
}
