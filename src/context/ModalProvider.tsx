import React, { useContext, useReducer, useCallback, ReactNode, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";

import debounce from "lodash.debounce";
import { performLocalDOMSearch } from "@/searchModal";
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
import { getBookData } from "@/booksData/getBookData";

// Import context and types from separate file
import { ModalContext, ModalContextType, ModalType } from "./ModalContext";

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const bookData = getBookData();
  const { locationRange, debouncedLocation } = useLocationRange();
  const [state, dispatch] = useReducer(modalReducer, initialModalState);
  const { currentModal, searchResults, searchQuery } = state;

  const openCharacterDetailsModal = useCallback((slug: string, isVideo: boolean, mediaSrc: string) => {
    dispatch({ type: "OPEN_CHARACTER_MODAL", payload: { slug, isVideo, mediaSrc } });
  }, []);

  const debouncedPerformSearch = useMemo(() => {
    let latestSearchId = 0;

    return debounce(async (query: string, loc: typeof debouncedLocation, bookSlug: string) => {
      if (!query?.trim()) {
        dispatch({ type: "SET_SEARCH_RESULTS", payload: { results: { header: "Please enter a search term.", items: [], isLoading: false } } });
        return;
      }

      const searchId = ++latestSearchId;

      try {
        const results = await performLocalDOMSearch(query, loc, bookSlug);

        // Only dispatch if this is still the latest search
        if (searchId === latestSearchId) {
          dispatch({ type: "SET_SEARCH_RESULTS", payload: { results } });
        }
      } catch {
        // Only dispatch error if this is still the latest search
        if (searchId === latestSearchId) {
          dispatch({ type: "SET_SEARCH_RESULTS", payload: { results: { header: "Search failed. Please try again.", items: [], isLoading: false } } });
        }
      }
    }, 350);
  }, [debouncedLocation, bookData.slug]);

  const openSearchModal = useCallback(
    (layoutView?: boolean, hideOverlay?: boolean, query: string = "") => {
      dispatch({ type: "OPEN_SEARCH_MODAL", payload: { layoutView, hideOverlay, query, isLoading: true } });

      // Set initial search results with loading state immediately
      if (query.trim()) {
        dispatch({ type: "SET_SEARCH_RESULTS", payload: { results: { header: `Searching for "${query}"...`, items: [], isLoading: true } } });

        // Then trigger the actual search
        setTimeout(() => {
          debouncedPerformSearch(query, debouncedLocation, bookData.slug);
        }, 0);
      }
    },
    [dispatch, debouncedPerformSearch, debouncedLocation, bookData.slug],
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
        debouncedPerformSearch(query, debouncedLocation, bookData.slug);
      } else {
        dispatch({ type: "SET_SEARCH_RESULTS", payload: { results: { header: "Please enter a search term.", items: [], isLoading: false } } });
      }
    },
    [debouncedPerformSearch, debouncedLocation, dispatch, bookData.slug],
  );

  const getModalContent = useCallback(
    (modal: ModalType) => {
      switch (modal.type) {
        case "character": {
          const matchingCharacter = bookData?.charactersData.find((character) => character.slug === modal.slug);
          if (!matchingCharacter) return null;

          return (
            <CharacterModal
              onClose={closeModal}
              isVideo={modal.isVideo}
              mediaSrc={modal.mediaSrc}
              matchingCharacter={matchingCharacter}
              endChapter={locationRange.endChapter}
              bookSlug={bookData.slug}
            />
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
