import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useGraphicsSettingsModal } from "@player/stores/modals/graphicsSettingsModal.store";
import GraphicsSettingsModal from "@player/components/modals/GraphicsSettingsModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const GraphicsSettingsModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useGraphicsSettingsModal();

  useEscapeKey(isOpen, closeModal);

  return createPortal(
    <AnimatePresence>{isOpen && <GraphicsSettingsModal onClose={closeModal} />}</AnimatePresence>,
    document.body,
  );
};
