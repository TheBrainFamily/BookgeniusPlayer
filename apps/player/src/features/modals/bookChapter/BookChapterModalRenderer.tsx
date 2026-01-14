import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useBookChapterModal } from "@player/stores/modals/bookChapterModal.store";
import BookChaptersModal from "@player/components/modals/BookChaptersModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const BookChapterModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useBookChapterModal();

  useEscapeKey(isOpen, closeModal);

  return createPortal(
    <AnimatePresence>{isOpen && <BookChaptersModal onClose={closeModal} />}</AnimatePresence>,
    document.body,
  );
};
