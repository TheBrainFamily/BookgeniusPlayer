import React, { createContext, useContext, useState, ReactNode, useMemo } from "react";
import { createPortal } from "react-dom";
import CharacterMedia from "@/components/CharacterMedia";
import { useLocation } from "@/state/LocationContext";
import { useDebounce } from "@/hooks/useDebounce";
import { BookData } from "@/booksData/types";
import { CharacterData } from "@/booksData/types";

const findLatestSummaryInRange = (character: CharacterData, endChapter: number) => {
  const latestSummary = character.infoPerChapter
    .filter((info) => info.chapter <= endChapter)
    .sort((a, b) => b.chapter - a.chapter)
    .reverse()[0].summary;
  return latestSummary;
};
export interface ModalContextType {
  openCharacterDetailsModal: (slug: string, isVideo: boolean, mediaSrc: string) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode; bookData: BookData }> = ({ children, bookData }) => {
  const { location } = useLocation();
  const debouncedLocation = useDebounce(location, 150);
  const [modalContent, setModalContent] = useState<{ slug: string; isVideo: boolean; mediaSrc: string } | null>(null);

  const openCharacterDetailsModal = (slug: string, isVideo: boolean, mediaSrc: string) => {
    setModalContent({ slug, isVideo, mediaSrc });
  };

  const closeModal = () => {
    setModalContent(null);
  };

  const range = useMemo(
    () => ({ chapter: debouncedLocation.chapter, paragraph: debouncedLocation.paragraph, endChapter: debouncedLocation.endChapter, endParagraph: debouncedLocation.endParagraph }),
    [debouncedLocation.chapter, debouncedLocation.paragraph, debouncedLocation.endChapter, debouncedLocation.endParagraph],
  );

  const matchingCharacter = bookData?.charactersData.find((character) => character.slug === modalContent?.slug);

  return (
    <ModalContext.Provider value={{ openCharacterDetailsModal }}>
      {children}
      {modalContent &&
        createPortal(
          <div className="modal-overlay active bg-black items-center justify-center" onClick={closeModal}>
            <div className="bg-transparent flex h-full items-center justify-center">
              <div className="flex flex-row lg:flex-col gap-4 max-w-full lg:max-w-120 max-h-full">
                <div className="rounded-full overflow-hidden max-h-[90vh] max-w-[90vh] lg:max-h-120 lg:max-w-120 border-4 border-[var(--entity-highlight-border-light)] aspect-square">
                  <CharacterMedia
                    mediaSrc={modalContent.mediaSrc}
                    isVideo={modalContent.isVideo}
                    canonicalName={matchingCharacter.slug}
                    commonAttrs={{
                      "data-original-src": modalContent.mediaSrc,
                      "data-character-name": matchingCharacter.characterName,
                      "data-summary": findLatestSummaryInRange(matchingCharacter, range.endChapter),
                      className: "w-full h-full object-cover",
                    }}
                  />
                </div>
                <div className="flex flex-col self-center p-4 rounded-lg bg-[var(--entity-highlight-bg-light)] border-2 border-[var(--entity-highlight-border-light)]">
                  <h4 className="italic font-bold text-center">{matchingCharacter.characterName}</h4>
                  <p className="text-center" dangerouslySetInnerHTML={{ __html: findLatestSummaryInRange(matchingCharacter, range.endChapter) }} />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ModalContext.Provider>
  );
};

export const useModal = (): ModalContextType => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};
