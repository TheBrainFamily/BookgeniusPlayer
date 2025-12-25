/**
 * EditModeContext
 *
 * Tracks when the user is holding the Command key (Mac) or Ctrl key (Windows/Linux)
 * to enable paragraph editing mode. When active, paragraphs become interactive
 * and clicking them opens the editor modal.
 *
 * Usage:
 *   const { isEditModeActive } = useEditMode();
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface EditModeContextType {
  isEditModeActive: boolean;
}

const EditModeContext = createContext<EditModeContextType>({ isEditModeActive: false });

interface EditModeProviderProps {
  children: React.ReactNode;
}

export function EditModeProvider({ children }: EditModeProviderProps) {
  const [isEditModeActive, setIsEditModeActive] = useState(false);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey) {
      setIsEditModeActive(true);
    }
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (event.key === "Meta" || event.key === "Control") {
      setIsEditModeActive(false);
    }
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditModeActive(false);
  }, []);

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      setIsEditModeActive(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handleKeyDown, handleKeyUp, handleBlur, handleVisibilityChange]);

  return <EditModeContext.Provider value={{ isEditModeActive }}>{children}</EditModeContext.Provider>;
}

export function useEditMode(): EditModeContextType {
  return useContext(EditModeContext);
}

let globalEditModeActive = false;

export function setGlobalEditModeActive(active: boolean): void {
  globalEditModeActive = active;
}

export function getGlobalEditModeActive(): boolean {
  return globalEditModeActive;
}

export function useEditModeGlobalSync(): void {
  const { isEditModeActive } = useEditMode();

  useEffect(() => {
    setGlobalEditModeActive(isEditModeActive);
  }, [isEditModeActive]);
}
