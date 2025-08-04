import React, { createContext, useContext, useState, useEffect } from "react";
import { reloadBookStringified } from "@/genericBookDataGetters/getBookStringified";

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

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setIsEditorMode(urlParams.get("editor") === "true");
  }, []);

  const reloadText = async () => {
    if (isReloading) return;

    setIsReloading(true);
    console.log("Reloading book text...");

    try {
      // Reload the data
      await reloadBookStringified();

      // Increment version to trigger re-renders
      setTextVersion((v) => v + 1);

      console.log("Text reloaded, version:", textVersion + 1);
    } catch (error) {
      console.error("Failed to reload text:", error);
    } finally {
      setIsReloading(false);
    }
  };

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
            disabled={isReloading}
            style={{
              padding: "8px 16px",
              backgroundColor: isReloading ? "#ccc" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: isReloading ? "not-allowed" : "pointer",
              fontSize: "14px",
            }}
          >
            {isReloading ? "Reloading..." : "Reload Book Data"}
          </button>
          <div style={{ marginTop: "5px", fontSize: "12px", color: "#666" }}>Version: {textVersion}</div>
        </div>
      )}
    </BookDataContext.Provider>
  );
}

export function useBookData() {
  return useContext(BookDataContext);
}
