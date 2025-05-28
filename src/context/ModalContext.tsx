import React, { createContext, useContext, useReducer, useCallback, ReactNode, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";

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
import { useLocationRange } from "@/hooks/useLocationRange";
import EditorModeModal from "@/components/modals/EditorModeModal";

// Different types of modals the application can display
export type ModalType =
  | { type: "character"; slug: string; isVideo: boolean; mediaSrc: string }
  | { type: "search"; layoutView?: boolean; hideOverlay?: boolean; query?: string; isLoading?: boolean }
  | { type: "deepResearch"; content?: string; layoutView?: boolean; hideOverlay?: boolean; isLoading?: boolean }
  | { type: "bookChapter"; chapter: number }
  | { type: "bookMenu" }
  | { type: "editorMode"; modalType: "edit-paragraph" | "add-character" | "remove-character"; onSubmit: (characterSlug?: string) => Promise<void> };

export interface ModalContextType {
  openCharacterDetailsModal: (slug: string, isVideo: boolean, mediaSrc: string) => void;
  openSearchModal: (layoutView?: boolean, hideOverlay?: boolean, query?: string) => void;
  openDeepResearchModal: (content?: string, layoutView?: boolean, hideOverlay?: boolean) => void;
  openBookChapterModal: (chapter?: number) => void;
  openBookMenuModal: () => void;
  openEditorModeModal: (modalType: "edit-paragraph" | "add-character" | "remove-character", onSubmit: (characterSlug?: string) => Promise<void>) => void;
  closeModal: () => void;
  currentModal: ModalType | null;
  performSearchInModal: (query: string) => void;
  searchQuery: string;
  searchResults: SearchResultsData | null;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode; bookData: BookData }> = ({ children, bookData }) => {
  const { locationRange, debouncedLocation } = useLocationRange();
  const [state, dispatch] = useReducer(modalReducer, initialModalState);
  const { currentModal, searchResults, searchQuery } = state;

  const openCharacterDetailsModal = useCallback((slug: string, isVideo: boolean, mediaSrc: string) => {
    dispatch({ type: "OPEN_CHARACTER_MODAL", payload: { slug, isVideo, mediaSrc } });
  }, []);

  const debouncedPerformSearch = useMemo(
    () =>
      debounce((query: string, loc: typeof debouncedLocation) => {
        if (!query?.trim()) {
          dispatch({ type: "SET_SEARCH_RESULTS", payload: { results: { header: "Please enter a search term.", items: [], isLoading: false } } });
          return;
        }

        const results = performLocalDOMSearch(query, loc);
        dispatch({ type: "SET_SEARCH_RESULTS", payload: { results } });
      }, 350),
    [debouncedLocation],
  );

  const openSearchModal = useCallback(
    (layoutView?: boolean, hideOverlay?: boolean, query: string = "") => {
      dispatch({ type: "OPEN_SEARCH_MODAL", payload: { layoutView, hideOverlay, query, isLoading: true } });

      // Set initial search results with loading state immediately
      if (query.trim()) {
        dispatch({ type: "SET_SEARCH_RESULTS", payload: { results: { header: `Searching for "${query}"...`, items: [], isLoading: true } } });

        // Then trigger the actual search
        setTimeout(() => {
          debouncedPerformSearch(query, debouncedLocation);
        }, 0);
      }
    },
    [dispatch, debouncedPerformSearch, debouncedLocation],
  );

  const openDeepResearchModal = useCallback((content?: string, layoutView?: boolean, hideOverlay?: boolean) => {
    // First, open with loading state if no content is provided
    if (!content) {
      dispatch({ type: "OPEN_DEEP_RESEARCH_MODAL", payload: { content: undefined, layoutView, hideOverlay, isLoading: true } });
    } else {
      // When content is provided, show it without loading state
      dispatch({ type: "OPEN_DEEP_RESEARCH_MODAL", payload: { content, layoutView, hideOverlay, isLoading: false } });
    }
  }, []);

  const openBookChapterModal = useCallback((chapter?: number) => {
    dispatch({ type: "OPEN_BOOK_CHAPTER_MODAL", payload: { chapter } });
  }, []);

  const openBookMenuModal = useCallback(() => {
    dispatch({ type: "OPEN_BOOK_MENU_MODAL" });
  }, []);

  const openEditorModeModal = useCallback((modalType: "edit-paragraph" | "add-character" | "remove-character", onSubmit: (characterSlug?: string) => Promise<void>) => {
    dispatch({ type: "EDITOR_MODE_MODAL", payload: { modalType, onSubmit } });
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

  const performSearchInModal = useCallback(
    (query: string) => {
      dispatch({ type: "SET_SEARCH_QUERY", payload: { query } });

      if (query.trim()) {
        // Set loading state immediately
        dispatch({ type: "SET_SEARCH_RESULTS", payload: { results: { header: `Searching for "${query}"...`, items: [], isLoading: true } } });

        // Then perform the actual search
        debouncedPerformSearch(query, debouncedLocation);
      } else {
        dispatch({ type: "SET_SEARCH_RESULTS", payload: { results: { header: "Please enter a search term.", items: [], isLoading: false } } });
      }
    },
    [debouncedPerformSearch, debouncedLocation, dispatch],
  );

  const getModalContent = useCallback(
    (modal: ModalType) => {
      switch (modal.type) {
        case "character": {
          const matchingCharacter = bookData?.charactersData.find((character) => character.slug === modal.slug);
          if (!matchingCharacter) return null;

          return (
            <CharacterModal onClose={closeModal} isVideo={modal.isVideo} mediaSrc={modal.mediaSrc} matchingCharacter={matchingCharacter} endChapter={locationRange.endChapter} />
          );
        }

        case "search":
          return (
            <SearchModal
              onClose={closeModal}
              layoutView={modal.layoutView}
              hideOverlay={modal.hideOverlay}
              searchResults={searchResults || { header: "Enter search query...", items: [], isLoading: modal.isLoading || false }}
            />
          );

        case "deepResearch":
          return <DeepResearchModal onClose={closeModal} content={modal.content} layoutView={modal.layoutView} hideOverlay={modal.hideOverlay} isLoading={modal.isLoading} />;

        case "bookChapter":
          return <BookChaptersModal onClose={closeModal} bookData={bookData} />;

        case "bookMenu": {
          return (
            <BookMenuModal
              onClose={closeModal}
              bookData={bookData}
              openBookChapterModal={openBookChapterModal}
              preloadBackgroundTracks={preloadBackgroundTracks}
              resetFurthestPageLocation={resetFurthestPageLocation}
            />
          );
        }

        case "editorMode": {
          return <EditorModeModal onClose={closeModal} bookData={bookData} />;
        }

        default:
          return null;
      }
    },
    [bookData, closeModal, locationRange, searchResults, openBookChapterModal],
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
      openEditorModeModal,
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
      openEditorModeModal,
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
