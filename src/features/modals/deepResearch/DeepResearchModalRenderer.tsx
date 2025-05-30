import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useDeepResearchModal } from "@/stores/modals/deepResearchModal.store";
import DeepResearchModal from "@/components/modals/DeepResearchModal";

export const DeepResearchModalRenderer: React.FC = () => {
  const { isOpen, content, layoutView, hideOverlay, isLoading, closeModal } = useDeepResearchModal();

  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, closeModal]);

  if (!isOpen) return null;

  return createPortal(<DeepResearchModal onClose={closeModal} content={content} layoutView={layoutView} hideOverlay={hideOverlay} isLoading={isLoading} />, document.body);
};
