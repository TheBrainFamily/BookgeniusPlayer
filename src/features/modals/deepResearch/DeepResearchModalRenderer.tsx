import React from "react";
import { createPortal } from "react-dom";
import { useDeepResearchModal } from "@/stores/modals/deepResearchModal.store";
import DeepResearchModal from "@/components/modals/DeepResearchModal";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export const DeepResearchModalRenderer: React.FC = () => {
  const { isOpen, content, layoutView, hideOverlay, isLoading, closeModal } = useDeepResearchModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(<DeepResearchModal onClose={closeModal} content={content} layoutView={layoutView} hideOverlay={hideOverlay} isLoading={isLoading} />, document.body);
};
