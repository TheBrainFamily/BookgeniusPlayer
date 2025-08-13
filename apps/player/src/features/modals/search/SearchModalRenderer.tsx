import React from "react";
import { createPortal } from "react-dom";
import { useSearchModal } from "@/stores/modals/searchModal.store";
import SearchModal from "@/components/modals/SearchModal";
import { useSearchLogic } from "./useSearchLogic";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export const SearchModalRenderer: React.FC = () => {
  const { isOpen, results, layoutView, hideOverlay, closeModal } = useSearchModal();

  // Initialize search logic (handles debounced search)
  useSearchLogic();
  useEscapeKey(isOpen, closeModal);

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
