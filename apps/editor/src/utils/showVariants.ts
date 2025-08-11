import * as monaco from "monaco-editor";
import { useAppStore } from "../stores/appStore";

export const setupSpanClickDetection = (
  editor: monaco.editor.IStandaloneCodeEditor
): (() => void) => {
  const disposables: monaco.IDisposable[] = [];

  // Helper function to find span element at position and extract its content
  const findSpanAtPosition = (position: monaco.Position): { id: string; text: string } | null => {
    const model = editor.getModel();
    if (!model) return null;

    const line = model.getLineContent(position.lineNumber);
    const offset = position.column - 1; // Convert to 0-based index

    // Find all span tags with IDs in the line
    const spanRegex = /<span\s+[^>]*id=["']([^"']+)["'][^>]*>([^<]*)<\/span>/g;
    let match;

    while ((match = spanRegex.exec(line)) !== null) {
      const spanStart = match.index;
      const spanEnd = spanStart + match[0].length;
      
      // Check if click position is anywhere within the entire span (including tags)
      if (offset >= spanStart && offset < spanEnd) {
        return { id: match[1], text: match[2] }; // Return both ID and text content
      }
    }

    // Alternative approach for more complex nested spans
    let currentSpanId: string | null = null;
    let spanOpenTagStart = -1;
    let spanContentStart = -1;
    let depth = 0;
    let i = 0;
    
    // Parse through the entire line to find all span boundaries
    while (i < line.length) {
      // Check for span opening tag
      if (line.substring(i).startsWith('<span')) {
        const closeTagIndex = line.indexOf('>', i);
        if (closeTagIndex !== -1) {
          const tagContent = line.substring(i, closeTagIndex + 1);
          const idMatch = tagContent.match(/id=["']([^"']+)["']/);
          if (idMatch && depth === 0) {
            currentSpanId = idMatch[1];
            spanOpenTagStart = i;
            spanContentStart = closeTagIndex + 1;
          }
          depth++;
          i = closeTagIndex;
        }
      }
      // Check for span closing tag
      else if (line.substring(i).startsWith('</span>')) {
        depth--;
        if (depth === 0 && currentSpanId && spanOpenTagStart !== -1) {
          const spanCloseEnd = i + 7; // Length of </span>
          
          // Check if cursor is anywhere within this span's range
          if (offset >= spanOpenTagStart && offset < spanCloseEnd) {
            const spanText = line.substring(spanContentStart, i).replace(/<[^>]*>/g, '');
            return { id: currentSpanId, text: spanText };
          }
          
          // Reset for next span
          currentSpanId = null;
          spanOpenTagStart = -1;
        }
        i += 6; // Skip past </span>
      }
      i++;
    }

    return null;
  };

  // Handle cursor position changes (clicks, keyboard navigation, etc.)
  const cursorPositionDisposable = editor.onDidChangeCursorPosition((e) => {
    // Check if showVariants is enabled
    if (!useAppStore.getState().showVariants) return;
    
    const position = e.position;
    const spanData = findSpanAtPosition(position);
    
    if (spanData) {
      console.log(`Cursor in span with ID: ${spanData.id}, text: "${spanData.text}"`);
    }
  });
  disposables.push(cursorPositionDisposable);

  // Handle mouse clicks specifically
  const mouseDownDisposable = editor.onMouseDown((e) => {
    // Check if showVariants is enabled
    if (!useAppStore.getState().showVariants) return;
    
    if (e.target.position) {
      const spanData = findSpanAtPosition(e.target.position);
      if (spanData) {
        console.log(`Clicked on span with ID: ${spanData.id}, text: "${spanData.text}"`);
        // Set the selected span ID and text in the app store
        useAppStore.getState().setSelectedSpan(spanData.id, spanData.text);
      }
    }
  });
  disposables.push(mouseDownDisposable);

  // Return cleanup function
  return () => {
    disposables.forEach((disposable) => disposable.dispose());
  };
};