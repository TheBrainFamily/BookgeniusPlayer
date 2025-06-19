import React from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useSentenceModal } from "@/stores/modals/sentenceModal.store";
import SentenceModal from "@/components/modals/SentenceModal";

export const SentenceModalRenderer: React.FC = () => {
  const { isOpen, closeModal, currentSentence, lowerSentence, sentenceId, lowerSentenceScore } = useSentenceModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(
    <SentenceModal onClose={closeModal} currentSentence={currentSentence} lowerSentence={lowerSentence} sentenceId={sentenceId} lowerSentenceScore={lowerSentenceScore} />,
    document.body,
  );
};
