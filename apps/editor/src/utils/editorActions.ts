import * as monaco from 'monaco-editor';
import { useBooksStore } from '../stores/booksStore';
import { 
  addCharacterContextMenu,
  wrapSelectionWithTag, 
  hasCharacterTags, 
  removeCharacterTags, 
  type Character 
} from './characterTagging';
import {setupVariantsGutter} from "./showVariants.ts";
import type {Variant} from "../types.ts";

export const setupCharacterContextMenu = (editor: monaco.editor.IStandaloneCodeEditor) => {
  // Create context keys for conditional menu items
  const hasCharacterTagsKey = editor.createContextKey('hasCharacterTags', false);
  
  // Update context when selection changes
  const updateContext = () => {
    hasCharacterTagsKey.set(hasCharacterTags(editor));
  };
  
  // Listen for selection changes
  editor.onDidChangeCursorSelection(updateContext);
  editor.onDidChangeModelContent(updateContext);

  // Add Character menu item using reusable function
  addCharacterContextMenu(
    editor,
    () => useBooksStore.getState().characters, // Function to get fresh characters
    (character: Character) => wrapSelectionWithTag(editor, character)
  );

  // Remove Character menu item
  editor.addAction({
    id: 'remove-character',
    label: 'Remove Character Tags',
    contextMenuGroupId: 'modification',
    contextMenuOrder: 1.6,
    precondition: 'editorHasSelection && hasCharacterTags',
    run: (ed) => {
      removeCharacterTags(ed);
    }
  });
};

export const setupVariants = (editor: monaco.editor.IStandaloneCodeEditor, onVariantClick?: (variant: Variant, allLineVariants?: Variant[]) => void): (() => void) => {
  console.log('setupVariants called with callback:', !!onVariantClick);
  
  return setupVariantsGutter(
    editor,
    () => {
      const state = useBooksStore.getState();
      console.log('Full store state:', state);
      console.log('Characters:', state.characters);
      console.log('Variants:', state.variants);
      return state.variants;
    }, // Function to get fresh variants
    (variant, allLineVariants) => {
      console.log('Variant clicked callback triggered:', variant);
      console.log('All line variants:', allLineVariants);
      console.log('onVariantClick available:', !!onVariantClick);
      if (onVariantClick) {
        console.log('Calling onVariantClick...');
        onVariantClick(variant, allLineVariants);
      } else {
        console.log('No onVariantClick callback provided!');
      }
    }
  );
}