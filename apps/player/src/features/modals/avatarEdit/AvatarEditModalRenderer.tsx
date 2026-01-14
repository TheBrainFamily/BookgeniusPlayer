import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useAvatarEditModal } from "@player/stores/modals/avatarEditModal.store";
import AvatarEditModal from "@player/components/modals/AvatarEditModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const AvatarEditModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useAvatarEditModal();

  useEscapeKey(isOpen, closeModal);

  return createPortal(
    <AnimatePresence>{isOpen && <AvatarEditModal />}</AnimatePresence>,
    document.body,
  );
};
