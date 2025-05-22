import React, { createContext, useContext, useReducer, useCallback, ReactNode, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";

import { useLocation } from "@/state/LocationContext";
import { useDebounce } from "@/hooks/useDebounce";
import debounce from "lodash.debounce";
import { BookData } from "@/booksData/types";
import { performLocalDOMSearch, SearchResultsData } from "@/searchModal";
import { resetFurthestPageLocation } from "@/helpers/reset-furthest-page-location";
import { preloadBackgroundTracks } from "@/deal-with-background-songs";

// Modal Components
import CharacterModal from "@/components/modals/CharacterModal";
import SearchModal from "@/components/modals/SearchModal";
import DeepResearchModal from "@/components/modals/DeepResearchModal";
import BookChaptersModal from "@/components/modals/BookChaptersModal";
import BookMenuModal from "@/components/modals/BookMenuModal";
import { modalReducer, initialModalState } from "./modalReducer";

// Different types of modals the application can display
export type ModalType =
  | { type: "character"; slug: string; isVideo: boolean; mediaSrc: string }
  | { type: "search"; layoutView?: boolean; hideOverlay?: boolean; initialQuery?: string }
  | { type: "deepResearch"; content?: string; layoutView?: boolean; hideOverlay?: boolean }
  | { type: "bookChapter"; chapter: number }
  | { type: "bookMenu" };

export interface ModalContextType {
  openCharacterDetailsModal: (slug: string, isVideo: boolean, mediaSrc: string) => void;
  openSearchModal: (layoutView?: boolean, hideOverlay?: boolean, initialQuery?: string) => void;
  openDeepResearchModal: (content?: string, layoutView?: boolean, hideOverlay?: boolean) => void;
  openBookChapterModal: (chapter?: number) => void;
  openBookMenuModal: () => void;
  closeModal: () => void;
  currentModal: ModalType | null;
  performSearchInModal: (query: string) => void;
  searchQuery: string;
  searchResults: SearchResultsData | null;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode; bookData: BookData }> = ({ children, bookData }) => {
  const { location } = useLocation();
  const debouncedLocation = useDebounce(location, 150);
  const [state, dispatch] = useReducer(modalReducer, initialModalState);
  const { currentModal, searchResults, searchQuery } = state;

  const openCharacterDetailsModal = useCallback((slug: string, isVideo: boolean, mediaSrc: string) => {
    dispatch({ type: "OPEN_CHARACTER_MODAL", payload: { slug, isVideo, mediaSrc } });
  }, []);

  const openSearchModal = useCallback((layoutView?: boolean, hideOverlay?: boolean, initialQuery: string = "") => {
    dispatch({ type: "OPEN_SEARCH_MODAL", payload: { layoutView, hideOverlay, initialQuery } });
  }, []);

  const openDeepResearchModal = useCallback((content?: string, layoutView?: boolean, hideOverlay?: boolean) => {
    dispatch({ type: "OPEN_DEEP_RESEARCH_MODAL", payload: { content, layoutView, hideOverlay } });
  }, []);

  const openBookChapterModal = useCallback((chapter?: number) => {
    dispatch({ type: "OPEN_BOOK_CHAPTER_MODAL", payload: { chapter } });
  }, []);

  const openBookMenuModal = useCallback(() => {
    dispatch({ type: "OPEN_BOOK_MENU_MODAL" });
  }, []);

  const closeModal = useCallback(() => {
    dispatch({ type: "CLOSE_MODAL" });
  }, []);

  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && currentModal) {
        closeModal();
      }
    };

    document.addEventListener("keydown", handleEscKey);

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [currentModal, closeModal]);

  const debouncedPerformSearch = useMemo(
    () =>
      debounce((query: string, loc: typeof debouncedLocation) => {
        if (!query?.trim()) {
          dispatch({ type: "SET_SEARCH_RESULTS", payload: { results: { header: "Please enter a search term.", items: [], isLoading: false } } });
          return;
        }

        dispatch({
          type: "SET_SEARCH_RESULTS",
          payload: { results: { header: searchResults?.header || `Searching for "${query}"...`, items: searchResults?.items || [], isLoading: true } },
        });

        const results = performLocalDOMSearch(query, loc);
        dispatch({ type: "SET_SEARCH_RESULTS", payload: { results } });
      }, 350),
    [debouncedLocation, searchResults],
  );

  const performSearchInModal = useCallback(
    (query: string) => {
      dispatch({ type: "SET_SEARCH_QUERY", payload: { query } });
      debouncedPerformSearch(query, debouncedLocation);
    },
    [debouncedPerformSearch, debouncedLocation],
  );

  useEffect(() => {
    if (currentModal?.type === "search" && currentModal.initialQuery && currentModal.initialQuery.trim() !== "") {
      if (
        searchQuery !== currentModal.initialQuery ||
        searchResults === null ||
        (searchResults && searchResults.items.length === 0 && searchResults.header.includes("Enter a term"))
      ) {
        performSearchInModal(currentModal.initialQuery);
      }
    }
  }, [currentModal, searchQuery, searchResults, performSearchInModal]);

  const range = useMemo(
    () => ({ chapter: debouncedLocation.chapter, paragraph: debouncedLocation.paragraph, endChapter: debouncedLocation.endChapter, endParagraph: debouncedLocation.endParagraph }),
    [debouncedLocation.chapter, debouncedLocation.paragraph, debouncedLocation.endChapter, debouncedLocation.endParagraph],
  );

  const getModalContent = useCallback(
    (modal: ModalType) => {
      switch (modal.type) {
        case "character": {
          const matchingCharacter = bookData?.charactersData.find((character) => character.slug === modal.slug);
          if (!matchingCharacter) return null;

          return <CharacterModal onClose={closeModal} isVideo={modal.isVideo} mediaSrc={modal.mediaSrc} matchingCharacter={matchingCharacter} endChapter={range.endChapter} />;
        }

        case "search":
          return <SearchModal onClose={closeModal} layoutView={modal.layoutView} hideOverlay={modal.hideOverlay} searchResults={searchResults} />;

        case "deepResearch":
          return <DeepResearchModal onClose={closeModal} content={modal.content} layoutView={modal.layoutView} hideOverlay={modal.hideOverlay} />;

        case "bookChapter":
          return <BookChaptersModal open={true} onClose={closeModal} bookData={bookData} />;

        case "bookMenu": {
          return (
            <BookMenuModal
              onClose={closeModal}
              bookData={bookData}
              openBookChapterModal={openBookChapterModal}
              openDeepResearchModal={openDeepResearchModal}
              preloadBackgroundTracks={preloadBackgroundTracks}
              resetFurthestPageLocation={resetFurthestPageLocation}
            />
          );
        }

        default:
          return null;
      }
    },
    [bookData, closeModal, range, searchResults, openBookChapterModal, openDeepResearchModal],
  );

  const renderModal = useCallback(() => {
    if (!currentModal) return null;

    const modalContent = getModalContent(currentModal);
    if (!modalContent) return null;

    return createPortal(modalContent, document.body);
  }, [currentModal, getModalContent]);

  // Memoize the context value to prevent unnecessary re-renders
  // ToDO: Is there a better way to do this?
  const contextValue = useMemo(
    () => ({
      openCharacterDetailsModal,
      openSearchModal,
      openDeepResearchModal,
      openBookChapterModal,
      openBookMenuModal,
      closeModal,
      currentModal,
      performSearchInModal,
      searchQuery,
      searchResults,
    }),
    [
      openCharacterDetailsModal,
      openSearchModal,
      openDeepResearchModal,
      openBookChapterModal,
      openBookMenuModal,
      closeModal,
      currentModal,
      performSearchInModal,
      searchQuery,
      searchResults,
    ],
  );

  return (
    <ModalContext.Provider value={contextValue}>
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
