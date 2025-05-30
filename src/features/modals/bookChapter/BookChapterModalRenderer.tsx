import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useBookChapterModal } from "@/stores/modals/bookChapterModal.store";
import BookChaptersModal from "@/components/modals/BookChaptersModal";
import { getBookData } from "@/booksData/getBookData";

export const BookChapterModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useBookChapterModal();
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

  return createPortal(<BookChaptersModal onClose={closeModal} bookData={bookData} />, document.body);
};
