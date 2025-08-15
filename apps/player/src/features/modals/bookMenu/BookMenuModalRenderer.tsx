import React from "react";
import { createPortal } from "react-dom";
import { useBookMenuModal } from "@player/stores/modals/bookMenuModal.store";
import { useBookChapterModal } from "@player/stores/modals/bookChapterModal.store";
import { useApiKeyModal } from "@player/stores/modals/apiKeyModal.store";
import BookMenuModal from "@player/components/modals/BookMenuModal";
import { resetFurthestPageLocation } from "@player/helpers/reset-furthest-page-location";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

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
      resetFurthestPageLocation={resetFurthestPageLocation}
    />,
    document.body,
  );
};
