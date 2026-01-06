import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useEscapeKey } from "@player/hooks/useEscapeKey";
import { useSentenceModal } from "@player/stores/modals/sentenceModal.store";
import SentenceModal from "@player/components/modals/SentenceModal";

export const SentenceModalRenderer: React.FC = () => {
  const {
    isOpen,
    closeModal,
    currentSentence,
    simplifiedSentence,
    currentSentenceId,
    simplifiedSentenceScore,
  } = useSentenceModal();

  useEscapeKey(isOpen, closeModal);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <SentenceModal
          onClose={closeModal}
          currentSentence={currentSentence}
          simplifiedSentence={simplifiedSentence}
          currentSentenceId={currentSentenceId}
          simplifiedSentenceScore={simplifiedSentenceScore}
        />
      )}
    </AnimatePresence>,
    document.body,
  );
};
