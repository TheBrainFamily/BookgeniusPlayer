import { useAppStore } from "../stores/appStore";
import { useBooksStore } from "../stores/booksStore.ts";
import { useChangesStore } from "../stores/changesStore.ts";
import { convertXmlToVariant } from "../utils/variantConversion";
import type { Variant } from "../types.ts";
import { useEffect, useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import { fetchBookData } from "../api/bookApi";
import { transformApiCharacters } from "../utils/characterTransform";

export const VariantSidebar = () => {
  const { selectedSpanId, selectedSpanText, setSelectedSpan, showVariants } = useAppStore();
  const { variants, currentBook, metadata, setMetadata, setChapters, setCharacters, setVariants } = useBooksStore();
  const { trackChange, getCurrentBookChanges, removeChange } = useChangesStore();

  const [selectedVariant, setSelectedVariant] = useState<Variant | undefined>();
  const [width, setWidth] = useState(700);
  const [originalXml, setOriginalXml] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; message: string } | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const isResizing = useRef(false);

  useEffect(() => {
    const variant = variants.find((variant) => variant.id === selectedSpanId);
    setSelectedVariant(variant);
  }, [selectedSpanId, variants]);

  // Store original XML when variant or selectedSpanText changes
  useEffect(() => {
    if (selectedSpanId) {
      const xml = convertVariantToXml();
      setOriginalXml(xml);
    }
  }, [selectedVariant, selectedSpanText, selectedSpanId]);

  // Force update of variant data when variants change (after save)
  // This ensures the sidebar shows the latest variant data
  useEffect(() => {
    if (selectedSpanId && selectedVariant) {
      // Re-find the variant in case it was updated
      const updatedVariant = variants.find((variant) => variant.id === selectedSpanId);
      if (updatedVariant && updatedVariant !== selectedVariant) {
        setSelectedVariant(updatedVariant);
      }
    }
  }, [variants, selectedSpanId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;

      const newWidth = window.innerWidth - e.clientX;
      const maxWidth = window.innerWidth * 0.5; // 50% max width
      const minWidth = 400;

      setWidth(Math.min(Math.max(newWidth, minWidth), maxWidth));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []); // Empty dependency array to set up listeners only once

  // Check if current variant has unsaved changes
  const hasUnsavedChanges = () => {
    if (!currentBook || !selectedSpanId) return false;
    const changes = getCurrentBookChanges(currentBook);
    return changes.some(change => change.filePath === `variants/${selectedSpanId}`);
  };

  if (!showVariants || !selectedSpanId) {
    return null;
  }

  const convertVariantToXml = () => {
    if (!selectedVariant) {
      const originalText = selectedSpanText || "This is an example of the <em>original</em> sentence...";
      return `<Variants id="${selectedSpanId}">
<span score="70">${originalText}</span>
</Variants>`;
    }

    const { id, simplifications } = selectedVariant;

    const spans = simplifications
      .map(({ score, sentences }) => {
        return `  <span score="${score}">${sentences[0]}</span>`;
      })
      .join("\n");

    return `<Variants id="${id}">
${spans}
</Variants>`;
  };

  const handleChange = (content: string | undefined) => {
    if (!content || !currentBook || !selectedSpanId) return;

    // Track changes to variants
    if (originalXml && content !== originalXml) {
      try {
        // For variants: store the parsed objects directly
        const variantObject = convertXmlToVariant(content);
        const originalVariantObject = convertXmlToVariant(originalXml);
        
        trackChange(
          currentBook, 
          metadata?.title || currentBook, 
          `variants/${selectedSpanId}`, 
          originalVariantObject, 
          variantObject, 
          "variant"
        );
      } catch (error) {
        console.error("Error converting XML to variant:", error);
        // Fallback to raw XML comparison
        trackChange(currentBook, metadata?.title || currentBook, `variants/${selectedSpanId}`, originalXml, content, "variant");
      }
    }
  };

  const handleSave = async () => {
    if (!currentBook || !selectedSpanId) return;
    
    const changes = getCurrentBookChanges(currentBook);
    const variantChange = changes.find(change => change.filePath === `variants/${selectedSpanId}`);
    
    if (!variantChange) {
      setSaveStatus({ success: false, message: "No changes to save" });
      return;
    }
    
    setIsSaving(true);
    setSaveStatus(null);
    
    try {
      const response = await fetch("http://localhost:3000/api/books/update-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          bookName: currentBook, 
          variant: variantChange.currentContent 
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save variant: ${response.status} ${response.statusText}`);
      }
      
      // Remove the change from tracking after successful save
      removeChange(currentBook, variantChange.filePath);
      
      // Refresh book data to get the latest variants
      try {
        const bookData = await fetchBookData(currentBook);
        setMetadata(bookData.metadata);
        setChapters(bookData.chapters);
        setCharacters(transformApiCharacters(bookData.characters));
        setVariants(bookData.allVariants);
        
        // Update the original XML to the newly saved version
        const currentChanges = getCurrentBookChanges(currentBook);
        const stillHasChange = currentChanges.some(change => change.filePath === `variants/${selectedSpanId}`);
        
        if (!stillHasChange) {
          // Convert the saved variant back to XML to update originalXml
          const savedXml = convertVariantToXml();
          setOriginalXml(savedXml);
        }
        
        setSaveStatus({ success: true, message: "Variant saved successfully!" });
        
        // Clear success message after 3 seconds
        setTimeout(() => setSaveStatus(null), 3000);
        
      } catch (error) {
        console.error("Error refreshing book data after save:", error);
        // Still show success for the save itself
        setSaveStatus({ success: true, message: "Variant saved but failed to refresh data" });
        setTimeout(() => setSaveStatus(null), 3000);
      }
      
    } catch (error) {
      console.error("Error saving variant:", error);
      setSaveStatus({ 
        success: false, 
        message: error instanceof Error ? error.message : "Failed to save variant" 
      });
    } finally {
      setIsSaving(false);
    }
  };


  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div className="variant-sidebar" ref={sidebarRef} style={{ width: `${width}px` }}>
      <div className="variant-sidebar-resize-handle" onMouseDown={handleResizeStart} />
      <div className="variant-sidebar-header">
        <h3>Variant Details</h3>
        <div className="variant-sidebar-actions">
          <button 
            className="variant-save-button" 
            onClick={handleSave}
            disabled={!hasUnsavedChanges() || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Only This File'}
          </button>
          <button className="variant-sidebar-close" onClick={() => setSelectedSpan(null)} aria-label="Close sidebar">
            ×
          </button>
        </div>
      </div>
      <div className="variant-sidebar-content">
        {saveStatus && (
          <div className={`variant-save-status ${saveStatus.success ? 'success' : 'error'}`}>
            {saveStatus.message}
          </div>
        )}
        <div style={{ flexShrink: 0 }}>
          <p>You are editing variants for original sentence:</p>
          <code>{selectedSpanText}</code>
        </div>
        <div style={{ flex: 1, minHeight: 0, marginTop: "20px" }}>
          <Editor
            height="100%"
            defaultLanguage="xml"
            value={convertVariantToXml()}
            onChange={handleChange}
            onMount={(editor) => {
              editorRef.current = editor;
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              overviewRulerBorder: false,
              scrollbar: { vertical: "auto", horizontal: "auto" },
            }}
          />
        </div>
      </div>
    </div>
  );
};
