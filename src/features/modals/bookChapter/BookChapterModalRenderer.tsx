import React from "react";
import { createPortal } from "react-dom";
import { useBookChapterModal } from "@/stores/modals/bookChapterModal.store";
import BookChaptersModal from "@/components/modals/BookChaptersModal";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export const BookChapterModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useBookChapterModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(<BookChaptersModal onClose={closeModal} />, document.body);
};
