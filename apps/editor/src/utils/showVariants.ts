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
      const spanContentStart = spanStart + match[0].indexOf('>') + 1;
      const spanContentEnd = spanContentStart + match[2].length;
      
      // Check if click position is within the span content
      if (offset >= spanContentStart && offset < spanContentEnd) {
        return { id: match[1], text: match[2] }; // Return both ID and text content
      }
    }

    // Alternative approach: Check if cursor is within any span (including nested content)
    // This handles cases where there might be nested tags or more complex content
    let inSpan = false;
    let currentSpanId: string | null = null;
    let spanStartPos = -1;
    let depth = 0;
    
    // Parse from beginning of line to cursor position
    for (let i = 0; i <= offset && i < line.length; i++) {
      // Check for span opening tag
      if (line.substring(i).startsWith('<span')) {
        const closeTagIndex = line.indexOf('>', i);
        if (closeTagIndex !== -1) {
          const tagContent = line.substring(i, closeTagIndex + 1);
          const idMatch = tagContent.match(/id=["']([^"']+)["']/);
          if (idMatch) {
            currentSpanId = idMatch[1];
            inSpan = true;
            spanStartPos = closeTagIndex + 1;
            depth++;
          }
          i = closeTagIndex;
        }
      }
      // Check for span closing tag
      else if (line.substring(i).startsWith('</span>')) {
        if (inSpan && currentSpanId && depth === 1) {
          // Extract the text content between span tags
          const spanText = line.substring(spanStartPos, i);
          return { id: currentSpanId, text: spanText.replace(/<[^>]*>/g, '') }; // Strip any nested tags
        }
        depth--;
        if (depth === 0) {
          inSpan = false;
          currentSpanId = null;
        }
        i += 6; // Skip past </span>
      }
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