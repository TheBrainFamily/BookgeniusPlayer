import React from "react";
import { createPortal } from "react-dom";
import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import CharacterModal from "@player/components/modals/CharacterModal";
import { useLocationRange } from "@player/hooks/useLocationRange";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const CharacterModalRenderer: React.FC = () => {
  const { isOpen, slug, isVideo, mediaSrc, closeModal } = useCharacterModal();
  const { locationRange } = useLocationRange();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen || !slug || !mediaSrc) return null;

  return createPortal(<CharacterModal onClose={closeModal} isVideo={isVideo} mediaSrc={mediaSrc} characterSlug={slug} endChapter={locationRange.endChapter} />, document.body);
};
