import React, { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, Variants } from "motion/react";
import { Search, BookOpen, FileText, Sparkles } from "lucide-react";

import { SearchResultsData, SearchResultItemData, cleanupSearchChapters } from "@/searchModal";
import { useLocation } from "@/state/LocationContext";
import ModalUI from "./ModalUI";
import { systemNavigateTo } from "@/helpers/paragraphsNavigation";

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
    <ModalUI title="Search Results" onClose={onClose} layoutView={layoutView} hideOverlay={hideOverlay}>
      <motion.div className="flex flex-col h-full relative overflow-hidden" variants={variants.container} initial="hidden" animate="visible" exit="exit">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-2xl bg-book-gradient-primary-tertiary" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full opacity-8 blur-xl bg-book-gradient-secondary-quaternary" />
        </div>

        <div className="relative px-4 pb-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg backdrop-blur-sm border bg-book-primary-20 border-book-primary-40">
              <Search size={20} />
            </div>
            <div>
              <p className="text-sm text-white">{t("discover_book_content")}</p>
            </div>
          </div>
        </div>

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
          <div className="flex-grow overflow-y-auto px-4 pb-4">
            <motion.div
              className="mb-4 p-3 rounded-lg backdrop-blur-sm border bg-book-secondary-20 border-book-secondary-30"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center gap-2 text-sm">
                <BookOpen size={16} />
                <span className="text-white/90">{searchResults.header}</span>
              </div>
            </motion.div>

            {searchResults.items.length > 0 ? (
              <motion.div className="space-y-3" variants={variants.container} initial="hidden" animate="visible">
                {searchResults.items.map((item: SearchResultItemData, index: number) => (
                  <motion.div
                    key={item.id}
                    className="group relative overflow-hidden cursor-pointer rounded-xl border backdrop-blur-sm bg-book-quaternary-40 border-book-primary-20"
                    variants={variants.item}
                    whileHover="hover"
                    whileTap="tap"
                    onClick={() => handleSearchResultClick(item)}
                    transition={{ delay: index * 0.05 }}
                  >
                    <motion.div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-book-gradient-shimmer"
                      variants={variants.shimmer}
                      initial="initial"
                      animate="animate"
                    />

                    <div className="relative p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="px-2 py-1 rounded-md text-xs font-medium bg-book-primary-30 text-book-primary">
                          <span className="flex items-center gap-1">
                            <FileText size={12} />
                            {t("chapter")} {item.chapter}
                          </span>
                        </div>
                        <div className="px-2 py-1 rounded-md text-xs font-medium bg-book-tertiary-30 text-book-tertiary">
                          {t("paragraph")} {item.paragraphNumber}
                        </div>
                      </div>

                      {item.summary && (
                        <motion.div
                          className="mb-2 text-xs italic text-white/70 p-2 rounded-md bg-book-secondary-20"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.1 }}
                        >
                          <div className="flex items-start gap-2">
                            <Sparkles size={12} className="mt-0.5 flex-shrink-0 text-book-tertiary" />
                            <span>{item.summary}</span>
                          </div>
                        </motion.div>
                      )}

                      <motion.div className="text-sm text-white/90 leading-relaxed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                        {item.text}
                      </motion.div>

                      <motion.div
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                        initial={{ scale: 0, rotate: -90 }}
                        whileHover={{ scale: 1, rotate: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="w-2 h-2 rounded-full bg-book-primary" />
                      </motion.div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                className="flex flex-col items-center justify-center py-12 text-center"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
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
  item: {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
    hover: { scale: 1.02, y: -2, transition: { duration: 0.2, ease: "easeInOut" } },
    tap: { scale: 0.98, transition: { duration: 0.1 } },
  },
  loading: { initial: { rotate: 0 }, animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity } } },
  shimmer: { initial: { x: "-100%" }, animate: { x: "100%", transition: { duration: 1.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.5 } } },
};

export default SearchModal;
