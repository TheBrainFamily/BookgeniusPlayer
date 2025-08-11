import { useEffect, useRef } from "react";
import { useBooksStore } from "../stores/booksStore.ts";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { setupCharacterContextMenu, setupVariants } from "../utils/editorActions.ts";
import { useParagraphHighlight } from "../hooks/useParagraphHighlight.ts";
import { useEditorSSE } from "../hooks/useEditorSSE.ts";
import { useBookSave } from "../hooks/useBookSave.ts";

export const BookEditor = () => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const { currentFile, currentChapterContent, setCurrentChapterContent, variants } = useBooksStore();
  const variantsCleanupRef = useRef<(() => void) | null>(null);

  // Custom hooks
  const { highlightParagraph } = useParagraphHighlight(editorRef);
  const { handleSave } = useBookSave();

  // Handle SSE events
  useEditorSSE({
    onParagraphSelected: (data) => {
      highlightParagraph(data.paragraphId);
    },
  });

  // Sync editor content when it changes externally
  useEffect(() => {
    if (editorRef.current && currentChapterContent !== undefined) {
      const currentValue = editorRef.current.getValue();
      if (currentValue !== currentChapterContent) {
        console.log("[BookEditor] Updating editor content");
        editorRef.current.setValue(currentChapterContent);
      }
    }
  }, [currentChapterContent, variants]);

  // Setup variants with proper cleanup
  useEffect(() => {
    // Wait for editor to be mounted
    const checkEditor = setInterval(() => {
      if (editorRef.current) {
        clearInterval(checkEditor);

        console.log("[BookEditor] Setting up variants...");
        const cleanup = setupVariants(editorRef.current, handleVariantClick);
        variantsCleanupRef.current = cleanup;
      }
    }, 100);

    return () => {
      clearInterval(checkEditor);
      if (variantsCleanupRef.current) {
        console.log("[BookEditor] Cleaning up variants...");
        variantsCleanupRef.current();
        variantsCleanupRef.current = null;
      }
    };
  }, [currentChapterContent]);

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
    setupCharacterContextMenu(editor);
    // Note: setupVariants is now handled in useEffect for proper cleanup
  };

  const handleContentChange = (content: string | undefined) => {
    if (content) {
      setCurrentChapterContent(content);
    }
  };

  return (
    <div className="editor-container">
      <div className="editor-header">
        <h2>{currentFile}</h2>
        <button className="editor-save-button" onClick={handleSave}>
          Save
        </button>
      </div>
      <Editor
        key={currentFile}
        height="calc(100vh - 60px)"
        defaultLanguage="xml"
        value={currentChapterContent}
        onChange={handleContentChange}
        onMount={handleEditorDidMount}
        options={{ minimap: { enabled: false }, fontSize: 14, wordWrap: "on", automaticLayout: true }}
      />
    </div>
  );
};
