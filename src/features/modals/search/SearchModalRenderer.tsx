import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useSearchModal } from "@/stores/modals/searchModal.store";
import SearchModal from "@/components/modals/SearchModal";
import { useSearchLogic } from "./useSearchLogic";

export const SearchModalRenderer: React.FC = () => {
  const { isOpen, results, layoutView, hideOverlay, closeModal } = useSearchModal();

  // Initialize search logic (handles debounced search)
  useSearchLogic();

  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, closeModal]);

  if (!isOpen) return null;

  return createPortal(
    <SearchModal
      onClose={closeModal}
      layoutView={layoutView}
      hideOverlay={hideOverlay}
      searchResults={results || { header: "Enter search query...", items: [], isLoading: false }}
    />,
    document.body,
  );
};
