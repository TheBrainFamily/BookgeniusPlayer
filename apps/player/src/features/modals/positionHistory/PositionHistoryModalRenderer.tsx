import React from "react";
import { createPortal } from "react-dom";
import { usePositionHistoryModal } from "@player/stores/modals/positionHistoryModal.store";
import PositionHistoryModal from "@player/components/modals/PositionHistoryModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const PositionHistoryModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = usePositionHistoryModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(<PositionHistoryModal onClose={closeModal} />, document.body);
};
