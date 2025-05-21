import React, { createContext, useContext, useState, ReactNode, useMemo } from "react";
import { createPortal } from "react-dom";
import CharacterMedia from "@/components/CharacterMedia";
import { useLocation } from "@/state/LocationContext";
import { useDebounce } from "@/hooks/useDebounce";
import { BookData } from "@/booksData/types";
import { CharacterData } from "@/booksData/types";

import ModalUI from "@/components/ModalUI";

const findLatestSummaryInRange = (character: CharacterData, endChapter: number) => {
  const latestSummary = character.infoPerChapter
    .filter((info) => info.chapter <= endChapter)
    .sort((a, b) => b.chapter - a.chapter)
    .reverse()[0].summary;
  return latestSummary;
};

// Different types of modals the application can display
export type ModalType =
  | { type: "character"; slug: string; isVideo: boolean; mediaSrc: string }
  | { type: "search"; layoutView?: boolean; hideOverlay?: boolean }
  | { type: "deepResearch"; content?: string }
  | { type: "bookChapter"; chapter: number };

export interface ModalContextType {
  openCharacterDetailsModal: (slug: string, isVideo: boolean, mediaSrc: string) => void;
  openSearchModal: (layoutView?: boolean, hideOverlay?: boolean) => void;
  openDeepResearchModal: (content?: string) => void;
  openBookChapterModal: (chapter: number) => void;
  closeModal: () => void;
  currentModal: ModalType | null;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode; bookData: BookData }> = ({ children, bookData }) => {
  const { location } = useLocation();
  const debouncedLocation = useDebounce(location, 150);
  const [currentModal, setCurrentModal] = useState<ModalType | null>(null);

  const openCharacterDetailsModal = (slug: string, isVideo: boolean, mediaSrc: string) => {
    setCurrentModal({ type: "character", slug, isVideo, mediaSrc });
  };

  const openSearchModal = (layoutView?: boolean, hideOverlay?: boolean) => {
    setCurrentModal({ type: "search", layoutView, hideOverlay });
  };

  const openDeepResearchModal = (content?: string) => {
    setCurrentModal({ type: "deepResearch", content });
  };

  const openBookChapterModal = (chapter: number) => {
    setCurrentModal({ type: "bookChapter", chapter });
  };

  const closeModal = () => {
    setCurrentModal(null);
  };

  const range = useMemo(
    () => ({ chapter: debouncedLocation.chapter, paragraph: debouncedLocation.paragraph, endChapter: debouncedLocation.endChapter, endParagraph: debouncedLocation.endParagraph }),
    [debouncedLocation.chapter, debouncedLocation.paragraph, debouncedLocation.endChapter, debouncedLocation.endParagraph],
  );

  const getModalContent = (modal: ModalType) => {
    switch (modal.type) {
      case "character": {
        const matchingCharacter = bookData?.charactersData.find((character) => character.slug === modal.slug);
        if (!matchingCharacter) return null;

        return (
          <ModalUI title={matchingCharacter.characterName} onClose={closeModal} width="lg" height="xl" className="bg-transparent">
            <div className="flex flex-row lg:flex-col gap-4 items-center">
              <div className="rounded-full overflow-hidden max-h-[90vh] max-w-[90vh] lg:max-h-120 lg:max-w-120 border-4 border-[var(--entity-highlight-border-light)] aspect-square">
                <CharacterMedia
                  mediaSrc={modal.mediaSrc}
                  isVideo={modal.isVideo}
                  canonicalName={matchingCharacter.slug}
                  commonAttrs={{
                    "data-original-src": modal.mediaSrc,
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
          </ModalUI>
        );
      }

      case "search":
        return (
          <ModalUI title="Research" onClose={closeModal} width="xl" height="lg" layoutView={modal.layoutView} hideOverlay={modal.hideOverlay}>
            <div className="prose dark:prose-invert max-w-none">
              <p>Research content goes here</p>
            </div>
          </ModalUI>
        );

      case "deepResearch":
        return (
          <ModalUI title="Deep Research" onClose={closeModal} width="xl" height="xl">
            <div className="prose dark:prose-invert max-w-none">{modal.content ? <div dangerouslySetInnerHTML={{ __html: modal.content }} /> : <p>No content available</p>}</div>
          </ModalUI>
        );

      case "bookChapter":
        return (
          <ModalUI title={`Chapter ${modal.chapter}`} onClose={closeModal} width="lg" height="md">
            <div className="prose dark:prose-invert max-w-none">
              <p>Chapter {modal.chapter} content goes here</p>
            </div>
          </ModalUI>
        );

      default:
        return null;
    }
  };

  // Create modals based on modal type
  const renderModal = () => {
    if (!currentModal) return null;

    return createPortal(getModalContent(currentModal), document.body);
  };

  return (
    <ModalContext.Provider value={{ openCharacterDetailsModal, openSearchModal, openDeepResearchModal, openBookChapterModal, closeModal, currentModal }}>
      {children}
      {renderModal()}
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
