import React, { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, Variants } from "motion/react";
import { Search, FileText } from "lucide-react";

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

  const modalTitle = (
    <div className="flex items-center gap-2">
      <Search size={20} className="mb-1" />
      <span>Search Results</span>
    </div>
  );

  return (
    <ModalUI title={modalTitle} onClose={onClose} layoutView={layoutView} hideOverlay={hideOverlay}>
      <motion.div className="flex flex-col h-full relative overflow-hidden" variants={variants.container} initial="hidden" animate="visible" exit="exit">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-2xl bg-book-gradient-primary-tertiary" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full opacity-8 blur-xl bg-book-gradient-secondary-quaternary" />
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
          <div className="flex-grow overflow-y-auto pb-4">
            {searchResults.items.length > 0 ? (
              <motion.div className="space-y-3" variants={variants.container} initial="hidden" animate="visible">
                {searchResults.items.map((item: SearchResultItemData, index: number) => (
                  <motion.div
                    key={item.id}
                    className="group relative overflow-hidden cursor-pointer rounded-xl border  border-book-primary-20"
                    variants={variants.item}
                    whileHover="hover"
                    whileTap="tap"
                    onClick={() => handleSearchResultClick(item)}
                    transition={{ delay: index * 0.05 }}
                  >
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

                      {item.text && (
                        <motion.div
                          className="mb-2 text-sm italic text-white/70 p-2 rounded-md bg-book-secondary-20"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.1 }}
                        >
                          <div className="flex items-start gap-2">
                            <span>{item.text}</span>
                          </div>
                        </motion.div>
                      )}

                      <motion.div className="text-sm text-white/90 leading-relaxed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                        {item.summary}
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
    hover: { scale: 0.98, transition: { duration: 0.2, ease: "easeInOut" } },
    tap: { scale: 0.95, transition: { duration: 0.1 } },
  },
  loading: { initial: { rotate: 0 }, animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity } } },
  shimmer: { initial: { x: "-100%" }, animate: { x: "100%", transition: { duration: 1.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.5 } } },
};

export default SearchModal;
