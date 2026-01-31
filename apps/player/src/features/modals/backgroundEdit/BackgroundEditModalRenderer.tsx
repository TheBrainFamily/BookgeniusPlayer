import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";

import { useBackgroundEditModal } from "@player/stores/modals/backgroundEditModal.store";
import BackgroundEditModal from "@player/components/modals/BackgroundEditModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const BackgroundEditModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useBackgroundEditModal();

  useEscapeKey(isOpen, closeModal);

  const portalTarget =
    typeof document !== "undefined"
      ? (document.getElementById("player-scope") ?? document.body)
      : null;

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <AnimatePresence>{isOpen && <BackgroundEditModal />}</AnimatePresence>,
    portalTarget,
  );
};
