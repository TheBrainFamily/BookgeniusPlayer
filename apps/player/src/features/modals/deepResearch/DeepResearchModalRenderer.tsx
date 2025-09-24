import React from "react";
import { createPortal } from "react-dom";
import { useDeepResearchModal } from "@player/stores/modals/deepResearchModal.store";
import DeepResearchModal from "@player/components/modals/DeepResearchModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const DeepResearchModalRenderer: React.FC = () => {
  const { isOpen, content, layoutView, hideOverlay, isLoading, closeModal, showDiveDeeperCTA, isDiveDeeperLoading, diveDeeperHandler } = useDeepResearchModal();

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
    />,
    document.body,
  );
};
