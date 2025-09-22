import React, { createContext, useContext, useState, useEffect } from "react";
import { reloadBookStringified } from "@player/genericBookDataGetters/getBookStringified";
import { useBookUpdateSSE } from "@player/hooks/useBookUpdateSSE";
import { reloadAllVariants } from "@player/genericBookDataGetters/getAllVariants";
import { bookIndex } from "@player/logic/BookIndex";
import { textCacheManager } from "@player/logic/TextCacheManager";

interface BookDataContextType {
  textVersion: number;
  reloadText: () => Promise<void>;
  isEditorMode: boolean;
}

const BookDataContext = createContext<BookDataContextType>({ textVersion: 0, reloadText: async () => {}, isEditorMode: false });

export function BookDataProvider({ children }: { children: React.ReactNode }) {
  const [textVersion, setTextVersion] = useState(0);
  const [isEditorMode, setIsEditorMode] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setIsEditorMode(urlParams.get("editor") === "true");
  }, []);

  const reloadVariantsText = async () => {
    if (isReloading) return;

    setIsReloading(true);
    console.log("Reloading book text...");

    try {
      // Reload the data
      await Promise.all([await reloadAllVariants()]);
      console.log("Text reloaded, version:", textVersion + 1);
    } catch (error) {
      console.error("Failed to reload text:", error);
    } finally {
      setIsReloading(false);
    }
  };

  const reloadText = async () => {
    if (isReloading) return;

    setIsReloading(true);
    console.log("Reloading book text...");

    try {
      // Reload the data
      await Promise.all([await reloadBookStringified(), await reloadAllVariants()]);
      bookIndex.invalidate();
      textCacheManager.reset();
      textCacheManager.initialize();

      // Increment version to trigger re-renders
      setTextVersion((v) => v + 1);

      console.log("Text reloaded, version:", textVersion + 1);
    } catch (error) {
      console.error("Failed to reload text:", error);
    } finally {
      setIsReloading(false);
    }
  };

  // Connect to SSE for automatic reloading in editor mode
  useBookUpdateSSE({
    enabled: isEditorMode,
    onProcessingStarted: () => {
      setIsProcessing(true);
      console.log("[BookDataContext] Book processing started");
    },
    onBookUpdated: async () => {
      setIsProcessing(false);
      console.log("[BookDataContext] Book updated, auto-reloading...");
      await reloadVariantsText();
    },
    onProcessingError: (error) => {
      setIsProcessing(false);
      console.error("[BookDataContext] Book processing error:", error);
    },
  });

  return (
    <BookDataContext.Provider value={{ textVersion, reloadText, isEditorMode }}>
      {children}
      {isEditorMode && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: 9999,
            backgroundColor: "white",
            padding: "10px",
            borderRadius: "5px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
            fontFamily: "monospace",
          }}
        >
          <button
            onClick={reloadText}
            disabled={isReloading || isProcessing}
            style={{
              padding: "8px 16px",
              backgroundColor: isReloading || isProcessing ? "#ccc" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: isReloading || isProcessing ? "not-allowed" : "pointer",
              fontSize: "14px",
            }}
          >
            {isProcessing ? "Processing..." : isReloading ? "Reloading..." : "Reload Book Data"}
          </button>
          <div style={{ marginTop: "5px", fontSize: "12px", color: "#666" }}>
            Version: {textVersion}
            {isProcessing && <span> (Processing book changes...)</span>}
          </div>
          <div style={{ marginTop: "3px", fontSize: "11px", color: "#999" }}>Auto-reload enabled via SSE</div>
        </div>
      )}
    </BookDataContext.Provider>
  );
}

export function useBookData() {
  return useContext(BookDataContext);
}
