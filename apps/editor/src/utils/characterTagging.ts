import * as monaco from 'monaco-editor';

export type Character = {
  name: string;
  tag: string;
};


export const addCharacterContextMenu = (
  editor: monaco.editor.IStandaloneCodeEditor,
  getCharacters: () => Character[],
  onCharacterSelect: (character: Character) => void
) => {
  // Add the main context menu action
  editor.addAction({
    id: 'add-character',
    label: 'Add Character →',
    contextMenuGroupId: 'modification',
    contextMenuOrder: 1.5,
    precondition: 'editorHasSelection',
    run: (ed) => {
      // Get fresh characters using the provided function
      const currentCharacters = getCharacters();
      
      // Get the current selection position
      const selection = ed.getSelection();
      if (!selection) return;

      // Get cursor position for dropdown placement
      const position = ed.getPosition();
      if (!position) return;

      const domNode = ed.getDomNode();
      if (!domNode) return;

      // Get the coordinates of the cursor
      const cursorCoords = ed.getScrolledVisiblePosition(position);
      if (!cursorCoords) return;

      const editorCoords = domNode.getBoundingClientRect();
      
      // Show character dropdown
      showCharacterDropdown(
        editorCoords.left + cursorCoords.left,
        editorCoords.top + cursorCoords.top + cursorCoords.height,
        currentCharacters,
        onCharacterSelect
      );
    }
  });
};

export const showCharacterDropdown = (
  x: number,
  y: number,
  characters: Character[],
  onCharacterSelect: (character: Character) => void
) => {
  // Remove any existing dropdown and clean up its event listeners
  const existingDropdown = document.getElementById('character-dropdown');
  if (existingDropdown) {
    // Call cleanup function if available to remove event listeners
    if ((existingDropdown as any).cleanup) {
      (existingDropdown as any).cleanup();
    } else {
      // Fallback: just remove the element
      existingDropdown.remove();
    }
  }

  // Create dropdown container
  const dropdown = document.createElement('div');
  dropdown.id = 'character-dropdown';
  dropdown.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.15), 0 4px 6px rgba(0,0,0,0.1);
    z-index: 10000;
    min-width: 220px;
    max-height: 320px;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    font-size: 14px;
    padding: 4px 0;
  `;

  // Dedicated cleanup function to ensure all event listeners are removed
  let cleanupDropdown: () => void;

  // Add character options
  characters.forEach((character, index) => {
    const option = document.createElement('div');
    option.style.cssText = `
      padding: 10px 16px;
      cursor: pointer;
      transition: all 0.15s ease;
      border-bottom: ${index < characters.length - 1 ? '1px solid #f3f4f6' : 'none'};
      color: #374151;
      font-weight: 500;
      display: flex;
      align-items: center;
      position: relative;
    `;
    option.textContent = character.name;
    
    option.addEventListener('mouseenter', () => {
      option.style.backgroundColor = '#f8fafc';
      option.style.color = '#1f2937';
      option.style.paddingLeft = '20px';
    });
    
    option.addEventListener('mouseleave', () => {
      option.style.backgroundColor = 'transparent';
      option.style.color = '#374151';
      option.style.paddingLeft = '16px';
    });
    
    option.addEventListener('click', () => {
      onCharacterSelect(character);
      cleanupDropdown();
    });
    
    dropdown.appendChild(option);
  });

  // Define event handlers and cleanup function
  const handleClickOutside = (event: MouseEvent) => {
    if (!dropdown.contains(event.target as Node)) {
      cleanupDropdown();
    }
  };

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      cleanupDropdown();
    }
  };

  // Implement the cleanup function
  cleanupDropdown = () => {
    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('keydown', handleEscape);
    if (dropdown.parentNode) {
      dropdown.remove();
    }
  };

  // Store cleanup function on the dropdown element for external access
  (dropdown as any).cleanup = cleanupDropdown;

  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleEscape);
  
  document.body.appendChild(dropdown);
};

export const wrapSelectionWithTag = (
  editor: monaco.editor.IStandaloneCodeEditor,
  character: Character
) => {
  const selection = editor.getSelection();
  if (!selection) return;

  const model = editor.getModel();
  if (!model) return;

  const selectedText = model.getValueInRange(selection);
  if (!selectedText) return;

  const taggedText = `<${character.tag}>${selectedText}</${character.tag}>`;

  // Execute the edit
  editor.executeEdits('add-character-tag', [{
    range: selection,
    text: taggedText,
    forceMoveMarkers: true
  }]);

  // Update selection to be after the inserted tag
  const newPosition = new monaco.Position(
    selection.endLineNumber,
    selection.startColumn + taggedText.length
  );
  
  editor.setSelection(new monaco.Selection(
    newPosition.lineNumber,
    newPosition.column,
    newPosition.lineNumber,
    newPosition.column
  ));
};

export const hasCharacterTags = (
  editor: monaco.editor.IStandaloneCodeEditor
): boolean => {
  const selection = editor.getSelection();
  if (!selection) return false;

  const model = editor.getModel();
  if (!model) return false;

  const selectedText = model.getValueInRange(selection);
  if (!selectedText) return false;

  // Check if the selected text contains character tags (any tag that looks like a character name)
  const characterTagPattern = /<([a-zA-Z][a-zA-Z0-9_-]*?)>.*?<\/\1>/g;
  return characterTagPattern.test(selectedText);
};

export const removeCharacterTags = (
  editor: monaco.editor.IStandaloneCodeEditor
) => {
  const selection = editor.getSelection();
  if (!selection) return;

  const model = editor.getModel();
  if (!model) return;

  const selectedText = model.getValueInRange(selection);
  if (!selectedText) return;

  // Remove all character tags from the selected text
  const characterTagPattern = /<([a-zA-Z][a-zA-Z0-9_-]*?)>(.*?)<\/\1>/g;
  const cleanedText = selectedText.replace(characterTagPattern, '$2');

  // Execute the edit
  editor.executeEdits('remove-character-tags', [{
    range: selection,
    text: cleanedText,
    forceMoveMarkers: true
  }]);

  // Update selection to cover the cleaned text
  const newEndPosition = new monaco.Position(
    selection.startLineNumber,
    selection.startColumn + cleanedText.length
  );
  
  editor.setSelection(new monaco.Selection(
    selection.startLineNumber,
    selection.startColumn,
    newEndPosition.lineNumber,
    newEndPosition.column
  ));
};