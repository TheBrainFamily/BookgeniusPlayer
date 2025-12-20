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

  return <BookDataContext.Provider value={{ textVersion, reloadText, isEditorMode }}>{children}</BookDataContext.Provider>;
}

export function useBookData() {
  return useContext(BookDataContext);
}
