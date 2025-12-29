import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";

import { useMusicEditModal } from "@player/stores/modals/musicEditModal.store";
import MusicEditModal from "@player/components/modals/MusicEditModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const MusicEditModalRenderer: React.FC = () => {
  const { isOpen, closeModal } = useMusicEditModal();

  useEscapeKey(isOpen, closeModal);

  return createPortal(<AnimatePresence>{isOpen && <MusicEditModal />}</AnimatePresence>, document.body);
};
