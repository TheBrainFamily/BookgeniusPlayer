import * as monaco from "monaco-editor";
import { useAppStore } from "../stores/appStore";

export const setupSpanClickDetection = (
  editor: monaco.editor.IStandaloneCodeEditor
): (() => void) => {
  const disposables: monaco.IDisposable[] = [];

  // Helper function to find span element at position using robust DOM parsing
  const findSpanAtPosition = (position: monaco.Position): { id: string; text: string } | null => {
    const model = editor.getModel();
    if (!model) return null;

    const line = model.getLineContent(position.lineNumber);
    const offset = position.column - 1; // Convert to 0-based index

    try {
      // Create a temporary DOM element to parse the HTML properly
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = line;
      
      // Find all span elements with id attributes
      const spans = tempDiv.querySelectorAll('span[id]');
      
      // Calculate position offsets for each span in the original line
      for (const span of spans) {
        const spanId = span.getAttribute('id');
        if (!spanId) continue;
        
        // Get the outer HTML to find the start position in the original line
        const spanOuterHTML = span.outerHTML;
        const spanIndex = line.indexOf(spanOuterHTML);
        
        if (spanIndex !== -1) {
          const spanEnd = spanIndex + spanOuterHTML.length;
          
          // Check if cursor is within this span's range
          if (offset >= spanIndex && offset < spanEnd) {
            // Extract text content, removing any nested HTML tags
            const textContent = span.textContent || '';
            return { id: spanId, text: textContent.trim() };
          }
        }
      }
      
      // Fallback: if DOM parsing fails or spans weren't found, try to find spans manually
      // This handles malformed HTML or edge cases where innerHTML parsing might not work
      return findSpanWithManualParsing(line, offset);
      
    } catch (error) {
      console.warn('DOM parsing failed, falling back to manual parsing:', error);
      return findSpanWithManualParsing(line, offset);
    }
  };

  // Fallback manual parsing method for edge cases
  const findSpanWithManualParsing = (line: string, offset: number): { id: string; text: string } | null => {
    // Use a more comprehensive regex that handles various attribute formats
    const spanRegex = /<span\s+(?:[^>]*\s+)?id\s*=\s*(['"])((?:(?!\1)[^\\]|\\.)*)?\1[^>]*>(.*?)<\/span>/gi;
    let match;
    
    spanRegex.lastIndex = 0; // Reset regex state
    
    while ((match = spanRegex.exec(line)) !== null) {
      const spanStart = match.index;
      const spanEnd = spanStart + match[0].length;
      
      // Check if cursor is within this span
      if (offset >= spanStart && offset < spanEnd) {
        const spanId = match[2]; // ID is captured in group 2
        const spanContent = match[3]; // Content is captured in group 3
        
        // Remove any nested HTML tags from content
        const cleanText = spanContent.replace(/<[^>]*>/g, '').trim();
        
        return { id: spanId, text: cleanText };
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