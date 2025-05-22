import React, { createContext, useContext, useState, ReactNode, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import CharacterMedia from "@/components/CharacterMedia";
import { useLocation } from "@/state/LocationContext";
import { useDebounce } from "@/hooks/useDebounce";
import debounce from "lodash.debounce";
import { BookData } from "@/booksData/types";
import { CharacterData } from "@/booksData/types";
import { performLocalDOMSearch, SearchResultsData, SearchResultItemData } from "@/searchModal";
import { goToParagraph } from "@/helpers/paragraphsNavigation";

import ModalUI from "@/components/ModalUI";
import { LLMAnswerViewer } from "@/ui/MarkdownComponent";

const findLatestSummaryInRange = (character: CharacterData, endChapter: number) => {
  const latestSummary = character.infoPerChapter.filter((info) => info.chapter <= endChapter).sort((a, b) => b.chapter - a.chapter)[0]?.summary; // Corrected newline issue
  return latestSummary;
};

// Different types of modals the application can display
export type ModalType =
  | { type: "character"; slug: string; isVideo: boolean; mediaSrc: string }
  | { type: "search"; layoutView?: boolean; hideOverlay?: boolean; initialQuery?: string }
  | { type: "deepResearch"; content?: string; layoutView?: boolean; hideOverlay?: boolean }
  | { type: "bookChapter"; chapter: number };

export interface ModalContextType {
  openCharacterDetailsModal: (slug: string, isVideo: boolean, mediaSrc: string) => void;
  openSearchModal: (layoutView?: boolean, hideOverlay?: boolean, initialQuery?: string) => void;
  openDeepResearchModal: (content?: string, layoutView?: boolean, hideOverlay?: boolean) => void;
  openBookChapterModal: (chapter: number) => void;
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
  const [currentModal, setCurrentModal] = useState<ModalType | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResultsData | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const openCharacterDetailsModal = (slug: string, isVideo: boolean, mediaSrc: string) => {
    setCurrentModal({ type: "character", slug, isVideo, mediaSrc });
    setSearchResults(null);
    setSearchQuery("");
  };

  const openSearchModal = (layoutView?: boolean, hideOverlay?: boolean, initialQuery: string = "") => {
    setSearchQuery(initialQuery);
    setCurrentModal({ type: "search", layoutView, hideOverlay, initialQuery });
  };

  const openDeepResearchModal = (content?: string, layoutView?: boolean, hideOverlay?: boolean) => {
    setCurrentModal({ type: "deepResearch", content, layoutView, hideOverlay });
    setSearchResults(null);
    setSearchQuery("");
  };

  const openBookChapterModal = (chapter: number) => {
    setCurrentModal({ type: "bookChapter", chapter });
    setSearchResults(null);
    setSearchQuery("");
  };

  const closeModal = () => {
    setCurrentModal(null);
    setSearchResults(null);
    setSearchQuery("");
  };

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
  }, [currentModal]);

  const debouncedPerformSearch = useMemo(
    () =>
      debounce((query: string, loc: typeof debouncedLocation) => {
        if (!query?.trim()) {
          setSearchResults({ header: "Please enter a search term.", items: [], isLoading: false });
          return;
        }
        setSearchResults((prevState) => ({ header: prevState?.header || `Searching for "${query}"...`, items: prevState?.items || [], isLoading: true }));
        const results = performLocalDOMSearch(query, loc);
        setSearchResults(results);
      }, 350),
    [debouncedLocation],
  );

  const performSearchInModal = (query: string) => {
    setSearchQuery(query);
    debouncedPerformSearch(query, debouncedLocation);
  };

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
  }, [currentModal]);

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
          <ModalUI title={matchingCharacter.characterName} onClose={closeModal} className="bg-transparent">
            <div className="flex flex-row lg:flex-col gap-4 items-center">
              <div className="rounded-full overflow-hidden h-full w-full max-h-[90vh] max-w-[90vh] lg:max-h-120 lg:max-w-120 border-4 border-[var(--entity-highlight-border-light)] aspect-square">
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
                <p className="text-center" dangerouslySetInnerHTML={{ __html: findLatestSummaryInRange(matchingCharacter, range.endChapter) || "" }} />
              </div>
            </div>
          </ModalUI>
        );
      }

      case "search":
        return (
          <ModalUI title="Search" onClose={closeModal} layoutView={modal.layoutView} hideOverlay={modal.hideOverlay}>
            <div className="flex flex-col h-full p-4">
              <input
                type="text"
                id="search-modal-input"
                value={searchQuery}
                onChange={(e) => performSearchInModal(e.target.value)}
                placeholder="Search in book..."
                className="p-2 border rounded mb-4 dark:bg-gray-800 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                autoFocus
              />
              {searchResults?.isLoading && (
                <div className="flex items-center justify-center my-4 py-4">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">Searching...</span>
                </div>
              )}
              {searchResults && !searchResults.isLoading && (
                <div className="flex-grow overflow-y-auto">
                  <div className="search-results-header text-sm text-gray-600 dark:text-gray-400 mb-2">{searchResults.header}</div>
                  {searchResults.items.length > 0 ? (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                      {searchResults.items.map((item: SearchResultItemData) => (
                        <li
                          key={item.id}
                          className="search-result-item p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-md transition-colors duration-150"
                          onClick={() => {
                            goToParagraph({ currentChapter: item.chapter, currentParagraph: item.paragraphNumber });
                            // closeModal();
                          }}
                        >
                          <div className="search-result-page font-semibold text-blue-600 dark:text-blue-400">
                            Chapter {item.chapter}, Paragraph {item.paragraphNumber}
                          </div>
                          {item.summary && <div className="search-result-summary text-xs italic text-gray-500 dark:text-gray-400 mt-1">{item.summary}</div>}
                          <div className="search-result-content text-sm text-gray-800 dark:text-gray-200 mt-1">{item.text}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">No results to display.</p>
                  )}
                </div>
              )}
            </div>
          </ModalUI>
        );

      case "deepResearch":
        return (
          <ModalUI title="Deep Research" onClose={closeModal} layoutView={modal.layoutView} hideOverlay={modal.hideOverlay}>
            <div className="prose dark:prose-invert max-w-none p-4">
              <LLMAnswerViewer answerMarkdown={modal.content} />
            </div>
          </ModalUI>
        );

      case "bookChapter":
        return (
          <ModalUI title={`Chapter ${modal.chapter}`} onClose={closeModal}>
            <div className="prose dark:prose-invert max-w-none p-4">
              <p>Chapter {modal.chapter} content goes here</p>
            </div>
          </ModalUI>
        );

      default:
        return null;
    }
  };

  const renderModal = () => {
    if (!currentModal) return null;
    const modalContent = getModalContent(currentModal);
    if (!modalContent) return null;

    return createPortal(modalContent, document.body);
  };

  return (
    <ModalContext.Provider
      value={{
        openCharacterDetailsModal,
        openSearchModal,
        openDeepResearchModal,
        openBookChapterModal,
        closeModal,
        currentModal,
        performSearchInModal,
        searchQuery,
        searchResults,
      }}
    >
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
