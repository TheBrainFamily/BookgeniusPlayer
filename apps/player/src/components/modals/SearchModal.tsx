import React, { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, Variants } from "motion/react";
import { Search, FileText } from "lucide-react";

import { SearchResultsData, SearchResultItemData, cleanupSearchChapters } from "@player/searchModal";
import { goToParagraph } from "@player/helpers/paragraphsNavigation";
import ModalUI from "./ModalUI";
import { highlightSearchInParagraph } from "@player/utils/textHighlighting";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@player/components/ui/accordion";
import { getChapterTitle } from "@player/utils/getChapterTitle";

interface SearchModalProps {
  onClose: () => void;
  layoutView?: boolean;
  hideOverlay?: boolean;
  searchResults: SearchResultsData | null;
}

const SearchModal: React.FC<SearchModalProps> = ({ onClose, layoutView, hideOverlay, searchResults }) => {
  const { t } = useTranslation();

  // Cleanup search chapters when modal unmounts
  useEffect(() => {
    return () => {
      cleanupSearchChapters();
    };
  }, []);

  const handleSearchResultClick = useCallback((item: SearchResultItemData) => {
    console.log(`SearchModal: Navigating to chapter ${item.chapter}, paragraph ${item.paragraphNumber}`);

    //TODO: fix this to get the value directly from bottom input hook or so
    const query = document.querySelector("#bottom-input").getAttribute("value");
    // Update location with 'system' source to trigger scrolling
    goToParagraph({ currentChapter: item.chapter, currentParagraph: item.paragraphNumber }, { behavior: "smooth" }).catch((error) =>
      console.warn("Failed to scroll to search result:", error),
    );
    highlightSearchInParagraph(item.chapter, item.paragraphNumber, query);
  }, []);

  // Group search results by chapter
  const groupedResults = React.useMemo(() => {
    if (!searchResults?.items) return {};

    return searchResults.items.reduce(
      (acc, item) => {
        if (!acc[item.chapter]) {
          acc[item.chapter] = [];
        }
        acc[item.chapter].push(item);
        return acc;
      },
      {} as Record<number, SearchResultItemData[]>,
    );
  }, [searchResults?.items]);

  const modalTitle = (
    <div className="flex items-center gap-2">
      <Search size={20} className="mb-1" />
      <span>Search Results</span>
    </div>
  );

  return (
    <ModalUI title={modalTitle} onClose={onClose} layoutView={layoutView} hideOverlay={hideOverlay}>
      <motion.div className="flex flex-col h-full relative overflow-hidden" variants={variants.container} initial="hidden" animate="visible" exit="exit">
        {searchResults?.isLoading && (
          <motion.div className="flex flex-col items-center justify-center py-12 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="relative">
              <motion.div
                className="w-12 h-12 border-3 rounded-full border-book-primary-30 border-t-book-primary"
                variants={variants.loading}
                initial="initial"
                animate="animate"
              />
              <motion.div
                className="absolute inset-0 w-12 h-12 border-3 border-transparent rounded-full border-t-book-tertiary-50"
                variants={variants.loading}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.1 }}
              />
            </div>
            <motion.div className="mt-4 text-white/90 font-medium" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              {t("searching")}
            </motion.div>
            <motion.div className="mt-2 text-white/60 text-sm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              {t("exploring_chapters")}
            </motion.div>
          </motion.div>
        )}

        {searchResults && !searchResults.isLoading && (
          <div className="flex-grow overflow-y-auto pb-4">
            {searchResults.items.length > 0 ? (
              <motion.div className="space-y-3" variants={variants.container} initial="hidden" animate="visible">
                <Accordion type="multiple" defaultValue={Object.keys(groupedResults).map(String)} className="w-full">
                  {Object.entries(groupedResults)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([chapter, items]) => (
                      <AccordionItem key={chapter} value={chapter} className="border-book-primary-20 rounded-lg mb-3 overflow-hidden">
                        <AccordionTrigger className="px-4 py-3 bg-book-primary-10 hover:bg-book-primary-20 text-book-primary hover:no-underline cursor-pointer">
                          <div className="flex items-center gap-2">
                            <FileText size={16} />
                            <span className="font-medium">
                              {getChapterTitle(Number(chapter), t)} ({items.length} {items.length === 1 ? "result" : "results"})
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-0 pb-0">
                          <div className="space-y-2 p-3">
                            {items.map((item: SearchResultItemData) => (
                              <motion.div
                                key={item.id}
                                className="group relative overflow-hidden cursor-pointer rounded-xl border border-book-primary-20 ease-in-out"
                                onClick={() => handleSearchResultClick(item)}
                                initial="hidden"
                                animate="visible"
                                whileHover="hover"
                                whileTap="tap"
                                variants={variants.item}
                              >
                                <div className="relative p-4 select-text antialiased">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="px-2 py-1 rounded-md text-xs font-medium bg-book-tertiary-30 text-book-tertiary">
                                      {t("paragraph")} {item.paragraphNumber}
                                    </div>
                                  </div>

                                  {item.text && (
                                    <div className="mb-2 text-sm italic text-white/70 p-2 rounded-md bg-book-secondary-20">
                                      <span dangerouslySetInnerHTML={{ __html: item.text }} />
                                    </div>
                                  )}

                                  <div className="text-sm text-white/90 leading-relaxed">
                                    <span dangerouslySetInnerHTML={{ __html: item.summary }} />
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                </Accordion>
              </motion.div>
            ) : (
              <motion.div
                className="flex flex-col items-center justify-center py-12 text-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <div className="p-4 rounded-full mb-4 backdrop-blur-sm border bg-book-secondary-20 border-book-secondary-30">
                  <Search size={24} />
                </div>
                <p className="text-white/80 text-sm">{t("no_results_to_display")}</p>
                <p className="text-white/70 text-xs mt-1">{t("try_different_search_terms")}</p>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>
    </ModalUI>
  );
};

const variants: Record<string, Variants> = {
  container: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut", staggerChildren: 0.1 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
  },
  loading: { initial: { rotate: 0 }, animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity } } },
  item: {
    hidden: { opacity: 0, boxShadow: "0 0 0 rgba(255,255,255,0)" },
    visible: { opacity: 1, y: 0, boxShadow: "0 0 0 rgba(255,255,255,0)" },
    hover: { y: -2, boxShadow: "0 4px 10px rgba(255,255,255,0.1)" },
    tap: { y: 0, boxShadow: "0 8px 16px rgba(255,255,255,0.15)" },
  },
};

export default SearchModal;
