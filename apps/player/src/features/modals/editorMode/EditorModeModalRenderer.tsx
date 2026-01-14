import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useEditorModeModal } from "@player/stores/modals/editorModeModal.store";
import EditorModeModal from "@player/components/modals/EditorModeModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const EditorModeModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useEditorModeModal();

  useEscapeKey(isOpen, closeModal);

  return createPortal(
    <AnimatePresence>{isOpen && <EditorModeModal onClose={closeModal} />}</AnimatePresence>,
    document.body,
  );
};
