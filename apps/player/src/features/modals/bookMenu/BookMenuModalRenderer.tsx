import React from "react";
import { createPortal } from "react-dom";
import { useBookMenuModal } from "@player/stores/modals/bookMenuModal.store";
import { useBookChapterModal } from "@player/stores/modals/bookChapterModal.store";
import { useApiKeyModal } from "@player/stores/modals/apiKeyModal.store";
import { usePositionHistoryModal } from "@player/stores/modals/positionHistoryModal.store";
import BookMenuModal from "@player/components/modals/BookMenuModal";
import { resetFurthestPageLocation } from "@player/helpers/reset-furthest-page-location";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const BookMenuModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useBookMenuModal();
  const { openModal: openBookChapterModal } = useBookChapterModal();
  const { openModal: openApiKeyModal } = useApiKeyModal();
  const { openModal: openPositionHistoryModal } = usePositionHistoryModal();

  const handleOpenBookChapterModal = (chapter?: number) => {
    closeModal(); // Close the book menu modal first
    openBookChapterModal(chapter);
  };

  const handleOpenApiKeyModal = () => {
    closeModal(); // Close the book menu modal first
    openApiKeyModal();
  };

  const handleOpenPositionHistoryModal = () => {
    closeModal(); // Close the book menu modal first
    openPositionHistoryModal();
  };

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(
    <BookMenuModal
      onClose={closeModal}
      openBookChapterModal={handleOpenBookChapterModal}
      openApiKeyModal={handleOpenApiKeyModal}
      openPositionHistoryModal={handleOpenPositionHistoryModal}
      resetFurthestPageLocation={resetFurthestPageLocation}
    />,
    document.body,
  );
};
