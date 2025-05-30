import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useBookMenuModal } from "@/stores/modals/bookMenuModal.store";
import { useBookChapterModal } from "@/stores/modals/bookChapterModal.store";
import BookMenuModal from "@/components/modals/BookMenuModal";
import { getBookData } from "@/booksData/getBookData";
import { preloadBackgroundTracks } from "@/deal-with-background-songs";
import { resetFurthestPageLocation } from "@/helpers/reset-furthest-page-location";

export const BookMenuModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useBookMenuModal();
  const { openModal: openBookChapterModal } = useBookChapterModal();

  const handleOpenBookChapterModal = (chapter?: number) => {
    closeModal(); // Close the book menu modal first
    openBookChapterModal(chapter);
  };
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

  return createPortal(
    <BookMenuModal
      onClose={closeModal}
      bookData={bookData}
      openBookChapterModal={handleOpenBookChapterModal}
      preloadBackgroundTracks={preloadBackgroundTracks}
      resetFurthestPageLocation={resetFurthestPageLocation}
    />,
    document.body,
  );
};
