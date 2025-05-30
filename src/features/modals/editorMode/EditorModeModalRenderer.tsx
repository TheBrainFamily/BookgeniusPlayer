import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useEditorModeModal } from "@/stores/modals/editorModeModal.store";
import EditorModeModal from "@/components/modals/EditorModeModal";
import { getBookData } from "@/booksData/getBookData";

export const EditorModeModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useEditorModeModal();
  const bookData = getBookData();

  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, closeModal]);

  if (!isOpen) return null;

  return createPortal(<EditorModeModal onClose={closeModal} bookData={bookData} />, document.body);
};
