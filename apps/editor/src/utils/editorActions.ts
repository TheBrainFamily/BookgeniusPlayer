import * as monaco from "monaco-editor";
import { useBooksStore } from "../stores/booksStore";
import { addCharacterContextMenu, wrapSelectionWithTag, hasCharacterTags, removeCharacterTags, type Character } from "./characterTagging";
import { setupSpanClickDetection } from "./showVariants.ts";
import { useAppStore } from "../stores/appStore.ts";

export const setupCharacterContextMenu = (editor: monaco.editor.IStandaloneCodeEditor) => {
  // Create context keys for conditional menu items
  const hasCharacterTagsKey = editor.createContextKey("hasCharacterTags", false);

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
    (character: Character) => wrapSelectionWithTag(editor, character),
  );

  // Remove Character menu item
  editor.addAction({
    id: "remove-character",
    label: "Remove Character Tags",
    contextMenuGroupId: "modification",
    contextMenuOrder: 1.6,
    precondition: "editorHasSelection && hasCharacterTags",
    run: (ed) => {
      removeCharacterTags(ed);
    },
  });
};

export const setupVariants = (editor: monaco.editor.IStandaloneCodeEditor): (() => void) => {
  console.log("setupVariants called - showVariants:", useAppStore.getState().showVariants);
  
  return setupSpanClickDetection(editor);
};
