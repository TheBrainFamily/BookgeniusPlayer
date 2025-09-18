import React, { memo, useCallback, useEffect, useMemo, useDeferredValue, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { motion, Variants } from "motion/react";
import { Search, FileText, Minimize2 } from "lucide-react";

import { Tooltip, TooltipTrigger, TooltipContent } from "@player/components/ui/tooltip";

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

export const SearchModal: React.FC<SearchModalProps> = ({ onClose, layoutView, hideOverlay, searchResults }) => {
  const { t } = useTranslation();

  const deferredResults = useDeferredValue(searchResults);

  const isCurrentlyLoading = Boolean(searchResults?.isLoading);
  const isDeferring = deferredResults !== searchResults;

  const showSpinner = isCurrentlyLoading || (isDeferring && !deferredResults);

  const showContent = Boolean(deferredResults) && !showSpinner;
  const hasItems = (deferredResults?.items?.length ?? 0) > 0;

  const [openChapters, setOpenChapters] = useState<string[]>([]);

  const groupedResults = useMemo(() => {
    if (!deferredResults?.items) return {};

    const items = deferredResults.items;
    const groups: Record<number, SearchResultItemData[]> = {};

    for (const it of items) {
      (groups[it.chapter] ??= []).push(it);
    }

    return groups;
  }, [deferredResults?.items]);

  useEffect(() => {
    if (hasItems && Object.keys(groupedResults).length > 0) {
      setOpenChapters(Object.keys(groupedResults));
    }
  }, [groupedResults, hasItems]);

  const handleCollapseAll = useCallback(() => {
    setOpenChapters([]);
  }, []);

  const areAllCollapsed = openChapters.length === 0;

  useEffect(() => () => cleanupSearchChapters(), []);

  const modalTitle = (
    <div className="flex items-center gap-2">
      <Search size={20} className="mb-1" />
      <span>Search Results</span>
    </div>
  );

  const headerActions =
    hasItems && showContent ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleCollapseAll}
            disabled={areAllCollapsed}
            className={"p-1 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-white/70 hover:text-white"}
            aria-label="Collapse all groups"
          >
            <Minimize2 size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Collapse all</p>
        </TooltipContent>
      </Tooltip>
    ) : null;

  return (
    <ModalUI title={modalTitle} onClose={onClose} layoutView={layoutView} hideOverlay={hideOverlay} headerActions={headerActions}>
      <motion.div className="flex flex-col h-full relative overflow-hidden" variants={variants.container} initial="hidden" animate="visible" exit="exit" aria-busy={showSpinner}>
        {showSpinner && (
          <motion.div
            className="flex flex-col items-center justify-center py-12 px-4"
            variants={variants.loadingContainer}
            initial="hidden"
            animate="visible"
            exit="exit"
            key="loading"
          >
            <div className="relative">
              <motion.div
                className="w-12 h-12 border-4 rounded-full border-book-primary-30 border-t-book-primary"
                variants={variants.loading}
                initial="initial"
                animate="animate"
              />
              <motion.div
                className="absolute inset-0 w-12 h-12 border-4 border-transparent rounded-full border-t-book-tertiary-50"
                variants={variants.loading}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.1 }}
              />
            </div>
            <motion.div className="mt-4 text-white/90 font-medium" variants={variants.loadingText} initial="hidden" animate="visible">
              {t("searching")}
            </motion.div>
            <motion.div className="mt-2 text-white/60 text-sm" variants={variants.loadingSubtext} initial="hidden" animate="visible">
              {t("exploring_chapters")}
            </motion.div>
          </motion.div>
        )}

        {showContent && (
          <motion.div className="flex-grow overflow-y-auto pb-4" variants={variants.content} initial="hidden" animate="visible" key="content">
            {hasItems ? (
              <motion.div className="space-y-3" variants={variants.container} initial="hidden" animate="visible">
                <Accordion type="multiple" value={openChapters} onValueChange={setOpenChapters} className="w-full">
                  {Object.entries(groupedResults)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([chapter, items]) => (
                      <ChapterGroup key={chapter} chapter={Number(chapter)} items={items} t={t} />
                    ))}
                </Accordion>
              </motion.div>
            ) : (
              <motion.div className="flex flex-col items-center justify-center py-12 text-center" variants={variants.noResults} initial="hidden" animate="visible">
                <div className="p-4 rounded-full mb-4 backdrop-blur-sm border bg-book-secondary-20 border-book-secondary-30">
                  <Search size={24} />
                </div>
                <p className="text-white/80 text-sm">{t("no_results_to_display")}</p>
                <p className="text-white/70 text-xs mt-1">{t("try_different_search_terms")}</p>
              </motion.div>
            )}
          </motion.div>
        )}
      </motion.div>
    </ModalUI>
  );
};

const ChapterGroup = memo(function ChapterGroup({ chapter, items, t }: { chapter: number; items: SearchResultItemData[]; t: TFunction }) {
  const chapterTitle = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <FileText size={16} />
        <span className="font-medium">
          {getChapterTitle(Number(chapter), t)} ({items.length} {items.length === 1 ? "result" : "results"})
        </span>
      </div>
    ),
    [chapter, items.length, t],
  );

  return (
    <AccordionItem value={String(chapter)} className="border-book-primary-20 rounded-lg mb-3 overflow-hidden">
      <AccordionTrigger className="px-4 py-3 bg-book-primary-10 hover:bg-book-primary-20 text-book-primary hover:no-underline cursor-pointer">{chapterTitle}</AccordionTrigger>
      <AccordionContent className="px-0 pb-0">
        <div className="space-y-2 p-3">
          {items.map((item, idx) => (
            <ResultCard key={item.id} item={item} appearIndex={idx} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
});

const ResultCard = memo(function ResultCard({ item, appearIndex }: { item: SearchResultItemData; appearIndex: number }) {
  const handleClick = useCallback(() => {
    const inputEl = document.getElementById("bottom-input") as HTMLInputElement | null;
    const query = inputEl?.value ?? "";

    goToParagraph({ currentChapter: item.chapter, currentParagraph: item.paragraphNumber }, { behavior: "smooth" }).catch((error) =>
      console.warn("Failed to scroll to search result:", error),
    );
    highlightSearchInParagraph(item.chapter, item.paragraphNumber, query);
  }, [item.chapter, item.paragraphNumber]);

  // Animate only first 25 elements
  const shouldAnimate = appearIndex < 25;
  const transition = shouldAnimate ? { delay: appearIndex * 0.015 } : undefined;

  return (
    <motion.div
      className="group relative overflow-hidden cursor-pointer rounded-xl border border-book-primary-20 bg-gradient-to-br from-book-primary-5 to-book-secondary-5 hover:from-book-primary-10 hover:to-book-secondary-10 transition-all duration-200"
      variants={variants.item}
      whileTap="tap"
      whileHover="hover"
      onClick={handleClick}
      transition={transition}
    >
      <div className="relative p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="px-2 py-1 rounded-md text-xs font-medium bg-book-tertiary-30 text-book-tertiary">{item.percentInChapter}% of chapter</div>
        </div>

        {item.text && (
          <div className="mb-2 text-sm italic text-white/70 p-2 rounded-md bg-book-secondary-20">
            <div className="flex items-start gap-2">
              <span dangerouslySetInnerHTML={{ __html: item.text }} />
            </div>
          </div>
        )}

        <div className="text-sm text-white/90 leading-relaxed">
          <span dangerouslySetInnerHTML={{ __html: item.summary }} />
        </div>
      </div>
    </motion.div>
  );
});

const variants: Record<string, Variants> = {
  container: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.22, ease: "easeOut", staggerChildren: 0.06 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.18 } },
  },
  item: {
    hidden: { opacity: 0, y: 12, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: "easeOut" } },
    hover: { scale: 0.985, transition: { duration: 0.15, ease: "easeInOut" } },
    tap: { scale: 0.97, transition: { duration: 0.08 } },
  },
  loading: { initial: { rotate: 0 }, animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity } } },
  shimmer: { initial: { x: "-100%" }, animate: { x: "100%", transition: { duration: 1.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.5 } } },
  loadingContainer: { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } },
  loadingText: { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { delay: 0.2 } } },
  loadingSubtext: { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { delay: 0.4 } } },
  content: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.3 } } },
  noResults: { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { delay: 0.3 } } },
};
