import React, { useEffect } from "react";
import { useModal } from "@/context/ModalContext";
import { useLocation } from "@/state/LocationContext";
import { useDebounce } from "@/hooks/useDebounce";
import { useCharacterNotes } from "@/hooks/useCharacterNotes";
import { useMemo } from "react";
import { BookData } from "@/booksData/types";

export const CharacterPlaceholderHandler: React.FC<{ bookData: BookData }> = ({ bookData }) => {
  const { openModal } = useModal();
  const { location } = useLocation();
  const debouncedLocation = useDebounce(location, 150);

  /* stable range object */
  const range = useMemo(
    () => ({ chapter: debouncedLocation.chapter, paragraph: debouncedLocation.paragraph, endChapter: debouncedLocation.endChapter, endParagraph: debouncedLocation.endParagraph }),
    [debouncedLocation.chapter, debouncedLocation.paragraph, debouncedLocation.endChapter, debouncedLocation.endParagraph],
  );

  const characterNotes = useCharacterNotes(range, bookData.charactersData, true, true);

  // useEffect(() => {
  //   const handleClick = (event: MouseEvent) => {
  //     const target = event.target as HTMLElement;
  //     const placeholder = target.closest(".character-placeholder") as HTMLElement;

  //     if (placeholder) {
  //       const character = placeholder.dataset.character;
  //       const isTalking = placeholder.dataset.isTalking === "true";
  //       const movingSrc = placeholder.dataset.srcMoving;
  //       const pictureSrc = placeholder.dataset.srcPicture;
  //       const summaryHTML = placeholder.dataset.summary;

  //       // Find matching character note
  //       const matchingCharacter = characterNotes.find(note => note.canonicalName === character);
  //       // Determine which media source to use in the modal
  //       const mediaSrc = isTalking && movingSrc ? movingSrc : pictureSrc;
  //       const isVideo = mediaSrc && !mediaSrc.toLowerCase().endsWith('.png');

  //       if (character && mediaSrc) {
  //         openModal(
  //           <div className="flex flex-row lg:flex-col gap-4 max-w-full lg:max-w-120 max-h-full">
  //             <div className="rounded-full overflow-hidden max-h-[90vh] max-w-[90vh] lg:max-h-120 lg:max-w-120 border-4 border-[var(--entity-highlight-border-light)]">
  //               {isVideo ? <video src={mediaSrc} autoPlay loop muted playsInline /> : <img src={mediaSrc} alt={character} />}
  //             </div>
  //             <div className="flex flex-col self-center p-4 rounded-lg bg-[var(--entity-highlight-bg-light)] border-2 border-[var(--entity-highlight-border-light)]">
  //               <h4 className="editable-text italic font-bold text-center">{character}</h4>
  //               <p className="text-center">{matchingCharacter?.summary || summaryHTML}</p>
  //             </div>
  //           </div>
  //         );
  //       }
  //     }
  //   };

  //   document.addEventListener("click", handleClick);
  //   return () => document.removeEventListener("click", handleClick);
  // }, [openModal, characterNotes]);

  return null;
};
