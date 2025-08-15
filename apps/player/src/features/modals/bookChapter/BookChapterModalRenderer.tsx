import React from "react";
import { createPortal } from "react-dom";
import { useBookChapterModal } from "@player/stores/modals/bookChapterModal.store";
import BookChaptersModal from "@player/components/modals/BookChaptersModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const BookChapterModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useBookChapterModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(<BookChaptersModal onClose={closeModal} />, document.body);
};
