import { useCallback } from 'react';
import * as monaco from 'monaco-editor';


// Safe function to find span by ID using DOM parsing instead of regex
const findSpanById = (htmlContent: string, spanId: string): { contentStart: number; contentEnd: number } | null => {
  try {
    // Use DOMParser to safely parse HTML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // Find the span element by ID
    const spanElement = doc.getElementById(spanId);
    if (!spanElement) {
      return null;
    }
    
    // Get the text content of the span
    const textContent = spanElement.textContent || '';
    if (!textContent) {
      return null;
    }
    
    // Find the position of this span in the original HTML
    const spanOuterHTML = spanElement.outerHTML;
    const spanIndex = htmlContent.indexOf(spanOuterHTML);
    
    if (spanIndex === -1) {
      return null;
    }
    
    // Return positions for the span's inner content to avoid Monaco formatting issues
    const openTagEnd = spanOuterHTML.indexOf('>') + 1;
    const contentStart = spanIndex + openTagEnd;
    const contentEnd = contentStart + textContent.length;
    
    return { contentStart, contentEnd };
  } catch (error) {
    console.error('Error parsing HTML for span ID:', error);
    return null;
  }
};

export const useParagraphHighlight = (editorRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>) => {
  const highlightByElementIndex = useCallback((paragraphNumber: number): void => {
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    const fullText = model.getValue();

    // Find all direct children of <Chapter> (p, blockquote, h4, etc.)
    const chapterPattern = /<Chapter[^>]*>(.*?)<\/Chapter>/si;
    const chapterMatch = fullText.match(chapterPattern);

    if (!chapterMatch) {
      console.log('Chapter not found in content');
      return;
    }

    const chapterContent = chapterMatch[1];

    // Find all direct child elements - flexible but controlled list
    const childElementPattern = /<(p|blockquote|h[1-6]|div|span|section|article|aside|figure|table|dialogue|stage-direction|verse)[^>]*>.*?<\/\1>/gi;
    const matches = [...chapterContent.matchAll(childElementPattern)];

    if (paragraphNumber < 0 || paragraphNumber >= matches.length) {
      console.log(`Element ${paragraphNumber} not found. Found ${matches.length} child elements (0-${matches.length - 1}).`);
      return;
    }

    // Get the target element (paragraphNumber is 0-indexed)
    const targetMatch = matches[paragraphNumber];
    const elementContent = targetMatch[0]; // Full element with tags
    const innerContent = targetMatch[0].replace(/^<[^>]*>|<\/[^>]*>$/g, ''); // Content without outer tags

    // Calculate absolute position of the element in the full text
    const chapterStart = chapterMatch.index! + chapterMatch[0].indexOf('>') + 1;
    const elementStart = chapterStart + chapterContent.indexOf(elementContent);
    const elementInnerStart = elementStart + targetMatch[0].indexOf('>') + 1;
    
    // Highlight the entire inner content using background-only decoration
    const highlightStart = elementInnerStart;
    const highlightEnd = elementInnerStart + innerContent.length;

    const startPosition = model.getPositionAt(highlightStart);
    const endPosition = model.getPositionAt(highlightEnd);

    const decorationCollection = editor.createDecorationsCollection([
      {
        range: new monaco.Range(
          startPosition.lineNumber,
          startPosition.column,
          endPosition.lineNumber,
          endPosition.column
        ),
        options: {
          className: 'highlight-decoration-background-only',
          isWholeLine: false,
          overviewRuler: null,
          minimap: null
        }
      }
    ]);

    // Position cursor at the beginning of the highlighted text
    editor.focus();
    editor.setPosition({
      lineNumber: startPosition.lineNumber,
      column: startPosition.column
    });

    // Scroll to the highlighted text
    editor.revealRangeInCenter(
      new monaco.Range(
        startPosition.lineNumber,
        startPosition.column,
        endPosition.lineNumber,
        endPosition.column
      )
    );

    setTimeout(() => {
      decorationCollection.clear();
    }, 3000);
  }, [editorRef]);

  const highlightParagraph = useCallback((paragraphId: number | string): void => {
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    const fullText = model.getValue();

    // First try to find by span ID if paragraphId is a string
    if (typeof paragraphId === 'string') {
      const spanMatch = findSpanById(fullText, paragraphId);

      if (spanMatch) {
        const startPosition = model.getPositionAt(spanMatch.contentStart);
        const endPosition = model.getPositionAt(spanMatch.contentEnd);

        const decorationCollection = editor.createDecorationsCollection([
          {
            range: new monaco.Range(
              startPosition.lineNumber,
              startPosition.column,
              endPosition.lineNumber,
              endPosition.column
            ),
            options: {
              inlineClassName: 'highlight-decoration'
            }
          }
        ]);

        // Scroll to the highlighted text
        editor.revealRangeInCenter(
          new monaco.Range(
            startPosition.lineNumber,
            startPosition.column,
            endPosition.lineNumber,
            endPosition.column
          )
        );

        setTimeout(() => {
          decorationCollection.clear();
        }, 3000);
        return;
      }

      // If span ID not found, extract paragraph number from span ID (e.g., "ch1-p2-s1" -> 2)
      const paragraphFromSpanId = paragraphId.match(/p(\d+)/)?.[1];
      if (paragraphFromSpanId) {
        // Convert to number and use as paragraph index (0-based)
        const extractedParagraphNumber = parseInt(paragraphFromSpanId);
        // Continue with element counting logic using this extracted number
        return highlightByElementIndex(extractedParagraphNumber);
      }
    }

    // If paragraphId is a number, use it directly
    const paragraphNumber = typeof paragraphId === 'number' ? paragraphId : 0;
    highlightByElementIndex(paragraphNumber);
  }, [editorRef, highlightByElementIndex]);

  return { highlightParagraph };
};