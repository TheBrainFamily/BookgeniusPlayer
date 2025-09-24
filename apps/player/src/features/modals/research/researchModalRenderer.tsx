import React from "react";
import { createPortal } from "react-dom";
import { useResearchModal } from "@player/stores/modals/researchModal.store";
import ResearchModal from "@player/components/modals/ResearchModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const ResearchModalRenderer: React.FC = () => {
  const { isOpen, content, layoutView, hideOverlay, isLoading, closeModal, state } = useResearchModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(
    <ResearchModal onClose={closeModal} content={content} layoutView={layoutView} hideOverlay={hideOverlay} isLoading={isLoading} state={state} />,
    document.body,
  );
};
