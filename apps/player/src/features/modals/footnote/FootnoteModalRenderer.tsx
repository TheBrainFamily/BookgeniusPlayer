import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useFootnoteModal } from "@player/stores/modals/footnoteModal.store";
import FootnoteModal from "@player/components/modals/FootnoteModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const FootnoteModalRenderer: React.FC = () => {
  const { isOpen, html, closeModal } = useFootnoteModal();

  useEscapeKey(isOpen, closeModal);

  return createPortal(
    <AnimatePresence>
      {isOpen && <FootnoteModal html={html} onClose={closeModal} />}
    </AnimatePresence>,
    document.body,
  );
};
