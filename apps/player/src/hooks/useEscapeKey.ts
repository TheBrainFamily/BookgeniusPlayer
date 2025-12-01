import { useEffect } from "react";

export const useEscapeKey = (isOpen: boolean, onEscape: () => void) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onEscape();
      }
    };

    // Use capture phase so later-registered (topmost) modals get priority
    // when they stopImmediatePropagation
    document.addEventListener("keydown", handleEsc, { capture: true });
    return () => document.removeEventListener("keydown", handleEsc, { capture: true });
  }, [isOpen, onEscape]);
};
