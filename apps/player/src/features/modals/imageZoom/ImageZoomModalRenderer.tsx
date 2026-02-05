import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";

import { useImageModal } from "@player/stores/modals/imageModal.store";
import { useEscapeKey } from "@player/hooks/useEscapeKey";
import ImageZoomModal from "@player/components/modals/ImageZoomModal";

export const ImageZoomModalRenderer: React.FC = () => {
  const { isOpen, src, alt, closeModal } = useImageModal();

  useEscapeKey(isOpen, closeModal);

  return createPortal(
    <AnimatePresence>
      {isOpen && src ? <ImageZoomModal src={src} alt={alt} onClose={closeModal} /> : null}
    </AnimatePresence>,
    document.body,
  );
};
