import React, { createContext, useContext, useState, useEffect } from "react";
import { useBookUpdateSSE } from "@player/hooks/useBookUpdateSSE";
import { bookIndex } from "@player/logic/BookIndex";
import { textCacheManager } from "@player/logic/TextCacheManager";

interface BookDataContextType {
  textVersion: number;
  reloadText: () => Promise<void>;
  isEditorMode: boolean;
}

const BookDataContext = createContext<BookDataContextType>({ textVersion: 0, reloadText: async () => {}, isEditorMode: false });

interface BookDataProviderProps {
  children: React.ReactNode;
  /** External textVersion from Convex - when provided, used instead of internal state */
  externalTextVersion?: number;
}

export function BookDataProvider({ children, externalTextVersion }: BookDataProviderProps) {
  const [internalTextVersion, setInternalTextVersion] = useState(0);

  // Use external version if provided (Convex mode), otherwise internal (legacy mode)
  const textVersion = externalTextVersion ?? internalTextVersion;
  const [isEditorMode, setIsEditorMode] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setIsEditorMode(urlParams.get("editor") === "true");
  }, []);

  // Legacy reload functions - now handled by Convex reactivity
  // Kept for API compatibility with useBookUpdateSSE
  const reloadText = async () => {
    if (isReloading) return;
    setIsReloading(true);
    console.log("[BookDataContext] Legacy reloadText called - now handled by Convex");

    try {
      // In Convex mode, data reloads automatically via reactive queries
      // This is just for compatibility - invalidate caches to trigger re-render
      bookIndex.invalidate();
      textCacheManager.reset();
      textCacheManager.initialize();
      setInternalTextVersion((v) => v + 1);
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
      console.log("[BookDataContext] Book updated - Convex handles reactivity");
      // In Convex mode, data reloads automatically
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
