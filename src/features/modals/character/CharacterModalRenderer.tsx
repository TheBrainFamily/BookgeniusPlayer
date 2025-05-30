import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useCharacterModal } from "@/stores/modals/characterModal.store";
import CharacterModal from "@/components/modals/CharacterModal";
import { getBookData } from "@/booksData/getBookData";
import { useLocationRange } from "@/hooks/useLocationRange";

export const CharacterModalRenderer: React.FC = () => {
  const { isOpen, slug, isVideo, mediaSrc, closeModal } = useCharacterModal();
  const { locationRange } = useLocationRange();
  const bookData = getBookData();

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, closeModal]);

  if (!isOpen || !slug || !mediaSrc) return null;

  const matchingCharacter = bookData.charactersData.find((character) => character.slug === slug);

  if (!matchingCharacter) return null;

  return createPortal(
    <CharacterModal
      onClose={closeModal}
      isVideo={isVideo}
      mediaSrc={mediaSrc}
      matchingCharacter={matchingCharacter}
      endChapter={locationRange.endChapter}
      bookSlug={bookData.slug}
    />,
    document.body,
  );
};
