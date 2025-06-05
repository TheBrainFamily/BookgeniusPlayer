import React from "react";
import { createPortal } from "react-dom";
import { useBookMenuModal } from "@/stores/modals/bookMenuModal.store";
import { useBookChapterModal } from "@/stores/modals/bookChapterModal.store";
import { useApiKeyModal } from "@/stores/modals/apiKeyModal.store";
import BookMenuModal from "@/components/modals/BookMenuModal";
import { preloadBackgroundTracks } from "@/deal-with-background-songs";
import { resetFurthestPageLocation } from "@/helpers/reset-furthest-page-location";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export const BookMenuModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useBookMenuModal();
  const { openModal: openBookChapterModal } = useBookChapterModal();
  const { openModal: openApiKeyModal } = useApiKeyModal();

  const handleOpenBookChapterModal = (chapter?: number) => {
    closeModal(); // Close the book menu modal first
    openBookChapterModal(chapter);
  };

  const handleOpenApiKeyModal = () => {
    closeModal(); // Close the book menu modal first
    openApiKeyModal();
  };

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(
    <BookMenuModal
      onClose={closeModal}
      openBookChapterModal={handleOpenBookChapterModal}
      openApiKeyModal={handleOpenApiKeyModal}
      preloadBackgroundTracks={preloadBackgroundTracks}
      resetFurthestPageLocation={resetFurthestPageLocation}
    />,
    document.body,
  );
};
