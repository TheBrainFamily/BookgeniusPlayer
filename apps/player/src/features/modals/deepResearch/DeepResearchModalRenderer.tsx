import React from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "@player/hooks/useEscapeKey";
import DeepResearchModal from "@player/components/modals/ResearchModal";
import { useDeepResearchModal } from "@player/stores/modals/researchModal.store";

export const DeepResearchModalRenderer: React.FC = () => {
  const { isOpen, content, layoutView, hideOverlay, isLoading, closeModal, showDiveDeeperCTA, isDiveDeeperLoading, diveDeeperHandler, type } = useDeepResearchModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(
    <DeepResearchModal
      onClose={closeModal}
      content={content}
      layoutView={layoutView}
      hideOverlay={hideOverlay}
      isLoading={isLoading}
      canDiveDeeper={showDiveDeeperCTA}
      onDiveDeeper={diveDeeperHandler}
      isDiveDeeperLoading={isDiveDeeperLoading}
      type={type}
    />,
    document.body,
  );
};
