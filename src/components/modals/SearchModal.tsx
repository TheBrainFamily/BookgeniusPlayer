import React, { useCallback, useEffect } from "react";
import { SearchResultsData, SearchResultItemData, cleanupSearchChapters } from "@/searchModal";
import { useLocation } from "@/state/LocationContext";
import ModalUIOld from "./ModalUIOld";
import { systemNavigateTo } from "@/helpers/paragraphsNavigation";
import { useTranslation } from "react-i18next";

interface SearchModalProps {
  onClose: () => void;
  layoutView?: boolean;
  hideOverlay?: boolean;
  searchResults: SearchResultsData | null;
}

const SearchModal: React.FC<SearchModalProps> = ({ onClose, layoutView, hideOverlay, searchResults }) => {
  const { setLocation } = useLocation();
  const { t } = useTranslation();

  // Cleanup search chapters when modal unmounts
  useEffect(() => {
    return () => {
      cleanupSearchChapters();
    };
  }, []);

  const handleSearchResultClick = useCallback(
    (item: SearchResultItemData) => {
      console.log(`SearchModal: Navigating to chapter ${item.chapter}, paragraph ${item.paragraphNumber}`);

      // Update location with 'system' source to trigger scrolling
      systemNavigateTo({ currentChapter: item.chapter, currentParagraph: item.paragraphNumber });
    },
    [onClose, setLocation],
  );

  return (
    <ModalUIOld title="Search" onClose={onClose} layoutView={layoutView} hideOverlay={hideOverlay}>
      <div className="flex flex-col h-full p-4">
        {searchResults?.isLoading && (
          <div className="flex items-center justify-center my-4 py-4">
            <svg className="animate-spin -ml-1 mr-3 w-4 h-4 lg:w-5 lg:h-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="text-gray-700 dark:text-gray-300">{t("searching")}</span>
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
                    onClick={() => handleSearchResultClick(item)}
                  >
                    <div className="search-result-page font-semibold text-blue-600 dark:text-blue-400">
                      {t("chapter")} {item.chapter}, {t("paragraph")} {item.paragraphNumber}
                    </div>
                    {item.summary && <div className="search-result-summary text-xs italic text-gray-500 dark:text-gray-400 mt-1">{item.summary}</div>}
                    <div className="search-result-content text-sm text-gray-800 dark:text-gray-200 mt-1">{item.text}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4">{t("no_results_to_display")}</p>
            )}
          </div>
        )}
      </div>
    </ModalUIOld>
  );
};

export default SearchModal;
