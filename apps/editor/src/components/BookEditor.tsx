import { useEffect, useRef, useState } from "react";
import { useBooksStore } from "../stores/booksStore.ts";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as monaco from 'monaco-editor';
import {setupCharacterContextMenu, setupVariants} from "../utils/editorActions.ts";
import { useParagraphHighlight } from "../hooks/useParagraphHighlight.ts";
import { useEditorSSE } from "../hooks/useEditorSSE.ts";
import { useBookSave } from "../hooks/useBookSave.ts";
import { VariantModal } from "./VariantModal.tsx";
import type { Variant } from "../types.ts";

export const BookEditor = () => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const { currentBook, currentFile, currentChapterContent, setCurrentChapterContent, variants } = useBooksStore();
  const variantsCleanupRef = useRef<(() => void) | null>(null);
  
  // Modal state
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [allLineVariants, setAllLineVariants] = useState<Variant[]>([]);
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Custom hooks
  const { highlightParagraph } = useParagraphHighlight(editorRef);
  const { handleSave } = useBookSave();

  // Handle SSE events
  useEditorSSE({
    onParagraphSelected: (data) => {
      highlightParagraph(data.paragraphId);
    }
  });

  // Sync editor content when it changes externally
  useEffect(() => {
    if (editorRef.current && currentChapterContent !== undefined) {
      const currentValue = editorRef.current.getValue();
      if (currentValue !== currentChapterContent) {
        console.log('[BookEditor] Updating editor content');
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
        
        console.log('[BookEditor] Setting up variants...');
        const cleanup = setupVariants(editorRef.current, handleVariantClick);
        variantsCleanupRef.current = cleanup;
      }
    }, 100);

    return () => {
      clearInterval(checkEditor);
      if (variantsCleanupRef.current) {
        console.log('[BookEditor] Cleaning up variants...');
        variantsCleanupRef.current();
        variantsCleanupRef.current = null;
      }
    };
  }, [currentChapterContent]);

  const handleVariantClick = (variant: Variant, allVariants?: Variant[]) => {
    console.log('handleVariantClick called with:', variant);
    console.log('All line variants:', allVariants);
    console.log('Setting modal state...');
    
    const lineVariants = allVariants || [variant];
    setAllLineVariants(lineVariants);
    setCurrentVariantIndex(0);
    setSelectedVariant(lineVariants[0]);
    setIsModalOpen(true);
    console.log('Modal should be open now');
  };

  const handleVariantUpdate = async (updatedVariant: Variant) => {
    console.log('Variant updated:', updatedVariant);
    
    // Update the variant in allLineVariants
    const updatedLineVariants = allLineVariants.map(v => 
      v.id === updatedVariant.id ? updatedVariant : v
    );
    setAllLineVariants(updatedLineVariants);
    
    // Update selected variant if it's the one being edited
    if (selectedVariant?.id === updatedVariant.id) {
      setSelectedVariant(updatedVariant);
    }
    
    try {
      await fetch('http://localhost:3000/api/books/update-variants', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookName: currentBook,
          variant: updatedVariant,
        })
      });
    } catch (error) {
      console.error('Error updating variants:', error);
      throw error;
    }
  };

  const handleNextVariant = () => {
    if (currentVariantIndex < allLineVariants.length - 1) {
      const newIndex = currentVariantIndex + 1;
      setCurrentVariantIndex(newIndex);
      setSelectedVariant(allLineVariants[newIndex]);
    }
  };

  const handlePrevVariant = () => {
    if (currentVariantIndex > 0) {
      const newIndex = currentVariantIndex - 1;
      setCurrentVariantIndex(newIndex);
      setSelectedVariant(allLineVariants[newIndex]);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedVariant(null);
    setAllLineVariants([]);
    setCurrentVariantIndex(0);
  };

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
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'on',
          automaticLayout: true,
        }}
      />
      <VariantModal
        variant={selectedVariant}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        currentIndex={currentVariantIndex}
        totalVariants={allLineVariants.length}
        onNext={handleNextVariant}
        onPrev={handlePrevVariant}
        hasNext={currentVariantIndex < allLineVariants.length - 1}
        hasPrev={currentVariantIndex > 0}
        onVariantUpdate={handleVariantUpdate}
      />
    </div>
  );
};