import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";

import { useMusicAddModal } from "@player/stores/modals/musicAddModal.store";
import MusicAddModal from "@player/components/modals/MusicAddModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const MusicAddModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useMusicAddModal();

  useEscapeKey(isOpen, closeModal);

  return createPortal(
    <AnimatePresence>{isOpen && <MusicAddModal />}</AnimatePresence>,
    document.body,
  );
};
