import React from "react";
import { createPortal } from "react-dom";
import { useEditorModeModal } from "@/stores/modals/editorModeModal.store";
import EditorModeModal from "@/components/modals/EditorModeModal";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export const EditorModeModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useEditorModeModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(<EditorModeModal onClose={closeModal} />, document.body);
};
