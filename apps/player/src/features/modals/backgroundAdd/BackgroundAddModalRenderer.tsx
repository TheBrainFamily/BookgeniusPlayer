import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";

import { useBackgroundAddModal } from "@player/stores/modals/backgroundAddModal.store";
import BackgroundAddModal from "@player/components/modals/BackgroundAddModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const BackgroundAddModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useBackgroundAddModal();

  useEscapeKey(isOpen, closeModal);

  return createPortal(
    <AnimatePresence>{isOpen && <BackgroundAddModal />}</AnimatePresence>,
    document.body,
  );
};
