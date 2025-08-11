import * as monaco from 'monaco-editor';
import type {Variant} from "../types.ts";

export const setupVariantsGutter = (
  editor: monaco.editor.IStandaloneCodeEditor,
  getVariants: () => Variant[],
  onVariantClick: (variant: Variant, allLineVariants?: Variant[]) => void
): (() => void) => {
  editor.updateOptions({
    glyphMargin: true
  });

  let decorationsCollection: monaco.editor.IEditorDecorationsCollection | null = null;
  let variantToLineMap: Map<string, number> = new Map();
  let lineToVariantsMap: Map<number, Variant[]> = new Map();
  
  // Store disposables for cleanup
  const disposables: monaco.IDisposable[] = [];
  
  // Debounce timer
  let debounceTimer: NodeJS.Timeout | null = null;
  const DEBOUNCE_DELAY = 300; // milliseconds

  const buildVariantMaps = (): void => {
    const model = editor.getModel();
    if (!model) return;

    const currentVariants = getVariants();
    
    // Clear existing maps
    variantToLineMap.clear();
    lineToVariantsMap.clear();
    
    if (!currentVariants || currentVariants.length === 0) return;

    // Create a set for faster lookup
    const variantIdSet = new Set(currentVariants.map(v => v.id));
    
    // Use Monaco's findMatches for safer searching
    // This regex finds all span tags with id attributes
    const matches = model.findMatches(
      '<span[^>]*\\bid=["\'"][^"\']+["\'"][^>]*>',
      false, // searchOnlyEditableRange
      true,  // isRegex
      false, // matchCase
      null,  // wordSeparators
      false  // captureMatches
    );
    
    matches.forEach(match => {
      const lineNumber = match.range.startLineNumber;
      const matchText = model.getValueInRange(match.range);
      
      // Extract ID using string manipulation instead of regex
      const idMatch = matchText.match(/\bid=["']([^"']+)["']/);
      if (idMatch) {
        const spanId = idMatch[1];
        
        // Only process spans that correspond to our variants
        if (variantIdSet.has(spanId)) {
          const variant = currentVariants.find(v => v.id === spanId);
          if (variant) {
            // Update variant-to-line map
            variantToLineMap.set(spanId, lineNumber);
            
            // Update line-to-variants map
            const existingVariants = lineToVariantsMap.get(lineNumber) || [];
            existingVariants.push(variant);
            lineToVariantsMap.set(lineNumber, existingVariants);
          }
        }
      }
    });
    
    console.log('Built variant maps:', { variantToLineMap, lineToVariantsMap });
  };

  const updateVariantDecorations = () => {
    console.log('Updating variant decorations...');
    
    // Rebuild maps when content changes
    buildVariantMaps();
    
    const decorations: monaco.editor.IModelDeltaDecoration[] = [];

    // Use the line-to-variants map to create decorations
    lineToVariantsMap.forEach((variants, lineNumber) => {
      if (variants.length > 0) {
        decorations.push({
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: false,
            glyphMarginClassName: 'variant-edit-icon',
            glyphMarginHoverMessage: {
              value: variants.length === 1 
                ? `Click to edit variant: ${variants[0].id}`
                : `Click to edit ${variants.length} variants on this line`
            }
          }
        });
      }
    });

    if (decorationsCollection) {
      decorationsCollection.clear();
    }
    decorationsCollection = editor.createDecorationsCollection(decorations);
  };

  // Debounced version of updateVariantDecorations
  const debouncedUpdateVariantDecorations = () => {
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Set new timer
    debounceTimer = setTimeout(() => {
      console.log('Executing debounced variant decoration update...');
      updateVariantDecorations();
      debounceTimer = null;
    }, DEBOUNCE_DELAY);
  };

  // Initial setup (no debounce needed)
  updateVariantDecorations();

  // Update decorations when content changes (with debounce)
  const contentChangeDisposable = editor.onDidChangeModelContent(() => {
    console.log('Content changed, scheduling decoration update...');
    debouncedUpdateVariantDecorations();
  });
  disposables.push(contentChangeDisposable);

  // Handle clicks on variant icons
  const mouseDownDisposable = editor.onMouseDown((e) => {
    console.log('Mouse click detected, target type:', e.target.type);
    
    // Check both enum and numeric value since we see target type: 3
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.type === 3) {
      console.log('Glyph margin clicked!');
      const lineNumber = e.target.position?.lineNumber;
      console.log('Line number:', lineNumber);
      
      if (lineNumber) {
        // Use the pre-built map for instant lookup
        const lineVariants = lineToVariantsMap.get(lineNumber) || [];
        
        console.log('Found variants on line (from map):', lineVariants);
        if (lineVariants.length > 0) {
          console.log('Opening variants for line:', lineNumber, lineVariants);
          // Pass the first variant and all line variants for navigation
          onVariantClick(lineVariants[0], lineVariants);
        } else {
          console.log('No variants found for line:', lineNumber);
        }
      }
    }
  });
  disposables.push(mouseDownDisposable);

  // Return cleanup function
  return () => {
    console.log('Cleaning up variant gutter...');
    
    // Clear any pending debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    
    // Dispose all event listeners
    disposables.forEach(disposable => disposable.dispose());
    
    // Clear decorations collection
    if (decorationsCollection) {
      decorationsCollection.clear();
      decorationsCollection = null;
    }
    
    // Clear maps
    variantToLineMap.clear();
    lineToVariantsMap.clear();
  };
};