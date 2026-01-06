import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";

import { useNoteEditModal } from "@player/stores/modals/noteEditModal.store";
import NoteEditModal from "@player/components/modals/NoteEditModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const NoteEditModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useNoteEditModal();

  useEscapeKey(isOpen, closeModal);

  return createPortal(
    <AnimatePresence>{isOpen && <NoteEditModal />}</AnimatePresence>,
    document.body,
  );
};
