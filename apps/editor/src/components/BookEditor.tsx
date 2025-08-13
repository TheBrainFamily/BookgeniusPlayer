import { useEffect, useRef } from "react";
import { useBooksStore } from "../stores/booksStore.ts";
import { useAppStore } from "../stores/appStore.ts";
import { useChangesStore } from "../stores/changesStore.ts";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { setupCharacterContextMenu, setupVariants } from "../utils/editorActions.ts";
import { useParagraphHighlight } from "../hooks/useParagraphHighlight.ts";
import { useEditorSSE } from "../hooks/useEditorSSE.ts";
import { useBookSave } from "../hooks/useBookSave.ts";
import { UnsavedChangesIndicator } from "./UnsavedChangesIndicator.tsx";

export const BookEditor = () => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const { currentFile, currentChapterContent, setCurrentChapterContent, variants, currentBook, metadata } = useBooksStore();
  const { showVariants, setShowVariants } = useAppStore();
  const { trackChange } = useChangesStore();
  const variantsCleanupRef = useRef<(() => void) | null>(null);
  const originalContentRef = useRef<string>("");
  const isUpdatingFromExternalSource = useRef<boolean>(false);

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
        console.log("[BookEditor] Updating editor content from external source");
        isUpdatingFromExternalSource.current = true;
        editorRef.current.setValue(currentChapterContent);
        // Update original content when content comes from external source (file load, save, discard)
        originalContentRef.current = currentChapterContent;
        isUpdatingFromExternalSource.current = false;
      }
    }
  }, [currentChapterContent, variants]);

  // Set original content when file changes (this is the true baseline)
  useEffect(() => {
    if (currentChapterContent !== undefined) {
      console.log("[BookEditor] File changed, setting original content:", currentFile, "Content length:", currentChapterContent.length);
      originalContentRef.current = currentChapterContent;
    }
  }, [currentFile]);

  // Also set original content when currentChapterContent is first loaded (initial mount)
  useEffect(() => {
    if (currentChapterContent !== undefined && originalContentRef.current === "") {
      console.log("[BookEditor] Initial content load, setting original content. Content length:", currentChapterContent.length);
      originalContentRef.current = currentChapterContent;
    }
  }, [currentChapterContent]);

  // Setup variants with proper cleanup
  useEffect(() => {
    // Wait for editor to be mounted
    const checkEditor = setInterval(() => {
      if (editorRef.current) {
        clearInterval(checkEditor);

        console.log("[BookEditor] Setting up variants...");
        const cleanup = setupVariants(editorRef.current);
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
  }, [currentChapterContent, showVariants]); // Re-run when showVariants changes

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
    setupCharacterContextMenu(editor);
    // Note: setupVariants is now handled in useEffect for proper cleanup
  };

  const handleContentChange = (content: string | undefined) => {
    console.log("[BookEditor] handleContentChange called:", {
      hasContent: !!content,
      isUpdatingFromExternalSource: isUpdatingFromExternalSource.current,
      currentBook,
      currentFile,
      hasOriginalContent: !!originalContentRef.current,
    });

    if (content && !isUpdatingFromExternalSource.current) {
      setCurrentChapterContent(content);

      // Track changes if we have original content and current book/file
      console.log("[BookEditor] Checking prerequisites:", {
        currentBook: !!currentBook,
        currentFile: !!currentFile,
        originalContent: !!originalContentRef.current,
        originalContentValue: originalContentRef.current ? originalContentRef.current.substring(0, 50) + "..." : "EMPTY",
      });

      if (currentBook && currentFile && originalContentRef.current) {
        console.log("[BookEditor] Tracking change:", {
          original: originalContentRef.current.substring(0, 100) + "...",
          current: content.substring(0, 100) + "...",
          same: originalContentRef.current === content,
        });

        trackChange(currentBook, metadata?.title || currentBook, currentFile, originalContentRef.current, content, "chapter");
      } else {
        console.log("[BookEditor] NOT tracking change - missing prerequisites:", { currentBook, currentFile, hasOriginalContent: !!originalContentRef.current });
      }
    } else {
      console.log("[BookEditor] NOT processing content change");
    }
  };

  return (
    <div className="editor-container">
      <div className="editor-header">
        <h2>{currentFile}</h2>
        <UnsavedChangesIndicator />
        {variants.length > 0 && (
          <div className="checkbox-container">
            <input type="checkbox" id="show-variants" checked={showVariants} onChange={(e) => setShowVariants(e.target.checked)} />
            <label htmlFor="show-variants">Show Variants On Click</label>
          </div>
        )}
        <button className="editor-save-button" onClick={handleSave}>
          Save Only This File
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
