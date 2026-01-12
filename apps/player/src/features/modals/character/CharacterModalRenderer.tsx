import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import CharacterModal from "@player/components/modals/CharacterModal";
import { useLocationRange } from "@player/hooks/useLocationRange";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const CharacterModalRenderer: React.FC = () => {
  const { isOpen, slug, isVideo, mediaSrc, chapter, paragraph, closeModal } = useCharacterModal();
  const { locationRange } = useLocationRange();

  useEscapeKey(isOpen, closeModal);

  const shouldShow = isOpen && slug && mediaSrc;

  // Portal to #root-player (inside #player-scope) so CSS scoped to #player-scope applies
  const portalTarget = document.getElementById("root-player") || document.body;

  return createPortal(
    <AnimatePresence>
      {shouldShow && (
        <CharacterModal
          onClose={closeModal}
          isVideo={isVideo}
          mediaSrc={mediaSrc}
          characterSlug={slug}
          endChapter={locationRange.endChapter}
          chapter={chapter ?? locationRange.currentChapter}
          paragraph={paragraph ?? locationRange.currentParagraph}
        />
      )}
    </AnimatePresence>,
    portalTarget,
  );
};
