import React, { memo, useCallback, useEffect, useMemo, useDeferredValue, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { motion } from "motion/react";
import { Search, FileText, Minimize2 } from "lucide-react";

import { Tooltip, TooltipTrigger, TooltipContent } from "@player/components/ui/tooltip";

import { SearchResultsData, SearchResultItemData, cleanupSearchChapters } from "@player/searchModal";
import { goToParagraph } from "@player/helpers/paragraphsNavigation";
import { ensureChapterWindow } from "@player/logic/BookContentVirtualizer";
import ModalUI from "./ModalUI";
import { highlightSearchInParagraph } from "@player/utils/textHighlighting";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@player/components/ui/accordion";
import { getChapterTitle } from "@player/utils/getChapterTitle";
import { cn } from "@player/lib/utils";
import { findScrollParent } from "@player/utils/findScrollParent";

interface SearchModalProps {
  onClose: () => void;
  layoutView?: boolean;
  hideOverlay?: boolean;
  searchResults: SearchResultsData | null;
  clickedAppearanceId?: string;
}

type SearchFilter = "all" | "mentioned" | "talking";

const FILTER_OPTIONS: Array<{ id: SearchFilter; translationKey: string; defaultLabel: string }> = [
  { id: "all", translationKey: "search_filter_all", defaultLabel: "All" },
  { id: "mentioned", translationKey: "search_filter_mentioned", defaultLabel: "Mentioned" },
  { id: "talking", translationKey: "search_filter_talking", defaultLabel: "Talking" },
];

const FILTER_VALUE_MAP: Record<SearchFilter, string | null> = { all: null, mentioned: "Mentioned", talking: "Talking" };

export const SearchModal: React.FC<SearchModalProps> = ({ onClose, layoutView, hideOverlay, searchResults, clickedAppearanceId }) => {
  const { t } = useTranslation();

  const deferredResults = useDeferredValue(searchResults);

  const isCurrentlyLoading = Boolean(searchResults?.isLoading);
  const isDeferring = deferredResults !== searchResults;
  const showSpinner = isCurrentlyLoading || (isDeferring && !deferredResults);
  const showContent = Boolean(deferredResults) && !showSpinner;

  const [activeFilter, setActiveFilter] = useState<SearchFilter>("all");

  const [openChapters, setOpenChapters] = useState<string[]>([]);

  const hasAnyResults = (deferredResults?.items?.length ?? 0) > 0;

  const filteredItems = useMemo(() => {
    const items = deferredResults?.items ?? [];
    const filterValue = FILTER_VALUE_MAP[activeFilter];
    if (!filterValue) {
      return items;
    }

    return items.filter((item) => item.type === filterValue);
  }, [activeFilter, deferredResults?.items]);

  const filterAvailability = useMemo(() => {
    const items = deferredResults?.items ?? [];

    const availability: Record<SearchFilter, boolean> = { all: true, mentioned: false, talking: false };

    for (const item of items) {
      if (!availability.mentioned && item.type === FILTER_VALUE_MAP.mentioned) {
        availability.mentioned = true;
      }
      if (!availability.talking && item.type === FILTER_VALUE_MAP.talking) {
        availability.talking = true;
      }

      if (availability.mentioned && availability.talking) {
        break;
      }
    }

    return availability;
  }, [deferredResults?.items]);

  useEffect(() => {
    if (!filterAvailability[activeFilter] && activeFilter !== "all") {
      setActiveFilter("all");
    }
  }, [activeFilter, filterAvailability]);

  const hasItems = filteredItems.length > 0;

  const handleCollapseAll = useCallback(() => {
    setOpenChapters([]);
  }, []);

  useEffect(() => {
    if (!clickedAppearanceId) return;

    const findTarget = () => {
      const container = document.getElementById("search-modal-accordion");
      return container?.querySelector<HTMLElement>(`[data-appearance-id="${clickedAppearanceId}"]`);
    };

    const scrollToTarget = () => {
      const target = findTarget();
      if (!target) {
        return;
      }

      const scrollParent = findScrollParent(target);
      if (!scrollParent) {
        target.scrollIntoView({ behavior: "instant", block: "center" });
        return;
      }

      const parentRect = scrollParent.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      const targetCenter = targetRect.top - parentRect.top + scrollParent.scrollTop + targetRect.height / 2;
      const desiredScrollTop = targetCenter - scrollParent.clientHeight / 2;

      const maxScrollTop = Math.max(0, scrollParent.scrollHeight - scrollParent.clientHeight);
      scrollParent.scrollTop = Math.min(Math.max(desiredScrollTop, 0), maxScrollTop);
    };

    const timeoutHandles: number[] = [];
    const schedule = (delay: number) => {
      if (delay === 0) {
        scrollToTarget();
      } else {
        timeoutHandles.push(window.setTimeout(scrollToTarget, delay));
      }
    };

    const rafId = window.requestAnimationFrame(() => {
      [0, 120, 240].forEach(schedule);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      timeoutHandles.forEach((handle) => window.clearTimeout(handle));
    };
  }, [clickedAppearanceId]);

  const areAllCollapsed = openChapters.length === 0;

  // Group search results by chapter
  const groupedResults = useMemo(() => {
    if (!filteredItems.length) return {};

    return filteredItems.reduce(
      (acc, item) => {
        if (!acc[item.chapter]) {
          acc[item.chapter] = [];
        }
        acc[item.chapter].push(item);
        return acc;
      },
      {} as Record<number, SearchResultItemData[]>,
    );
  }, [filteredItems]);

  const sortedChapterEntries = useMemo(() => {
    const entries = Object.entries(groupedResults);
    if (deferredResults?.areEmbeddings) {
      return entries.sort(([chapterA, itemsA], [chapterB, itemsB]) => {
        const maxA = itemsA.reduce((m, i) => Math.max(m, i.score ?? -Infinity), -Infinity);
        const maxB = itemsB.reduce((m, i) => Math.max(m, i.score ?? -Infinity), -Infinity);
        if (maxA === maxB) return Number(chapterA) - Number(chapterB);
        return maxB - maxA;
      });
    }
    return entries.sort(([a], [b]) => Number(a) - Number(b));
  }, [groupedResults, deferredResults?.areEmbeddings]);

  const previousItemsSignatureRef = useRef<string>("");

  useEffect(() => {
    // Only auto-expand chapters when the underlying search results change.
    const rawItems = deferredResults?.items ?? [];
    const signature = rawItems.map((item) => String(item.id ?? `${item.chapter}-${item.paragraphNumber}`)).join("|");

    if (signature === previousItemsSignatureRef.current) {
      return;
    }

    previousItemsSignatureRef.current = signature;

    if (filteredItems.length > 0) {
      const chapters = Array.from(new Set(filteredItems.map((item) => String(item.chapter))));
      setOpenChapters(chapters);
    } else {
      setOpenChapters([]);
    }
  }, [filteredItems, deferredResults?.items]);

  useEffect(() => () => cleanupSearchChapters(), []);

  const modalTitle = (
    <div className="flex items-center gap-2">
      <Search size={20} className="mb-1" />
      <span>Search Results</span>
    </div>
  );

  const searchActions = hasAnyResults && searchResults?.isCharacterResults && (
    <div className="flex items-center gap-2 px-2">
      {FILTER_OPTIONS.map((option) => {
        const isActive = activeFilter === option.id;
        const isDisabled = option.id !== "all" && !filterAvailability[option.id];
        const label = t(option.translationKey, { defaultValue: option.defaultLabel });
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              if (isDisabled) {
                return;
              }
              setActiveFilter(option.id);
            }}
            disabled={isDisabled}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              isActive
                ? "bg-book-primary text-black shadow-sm"
                : "bg-book-primary-20 text-white/70 hover:text-white hover:bg-book-primary-30 disabled:opacity-40 disabled:hover:bg-book-primary-20 disabled:hover:text-white/70",
            )}
            aria-pressed={isActive}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  // Decide chapter ordering based on embeddings or not
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
    <ModalUI title={modalTitle} onClose={onClose} layoutView={layoutView} hideOverlay={hideOverlay} headerActions={headerActions} searchActions={searchActions}>
      <div className="flex flex-col h-full relative overflow-hidden" aria-busy={showSpinner}>
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
          <div className="flex-grow overflow-y-auto" key="content">
            <div className="space-y-3">
              {hasItems ? (
                <div className="space-y-3">
                  <Accordion id="search-modal-accordion" type="multiple" value={openChapters} onValueChange={setOpenChapters} className="w-full">
                    {sortedChapterEntries.map(([chapter, items]) => (
                      <ChapterGroup key={chapter} chapter={Number(chapter)} items={items} t={t} clickedAppearanceId={clickedAppearanceId} />
                    ))}
                  </Accordion>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-4 rounded-full mb-4 backdrop-blur-sm border bg-book-secondary-20 border-book-secondary-30">
                    <Search size={24} />
                  </div>
                  <p className="text-white/80 text-sm">{t("no_results_to_display")}</p>
                  <p className="text-white/70 text-xs mt-1">{t("try_different_search_terms")}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalUI>
  );
};

const ChapterGroup = memo(function ChapterGroup({
  chapter,
  items,
  t,
  clickedAppearanceId,
}: {
  chapter: number;
  items: SearchResultItemData[];
  t: TFunction;
  clickedAppearanceId?: string;
}) {
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
      <AccordionTrigger className="px-2 py-3 bg-book-primary-10 hover:bg-book-primary-20 text-book-primary hover:no-underline cursor-pointer">{chapterTitle}</AccordionTrigger>
      <AccordionContent className="px-0 pb-0">
        <div className="space-y-2 py-2 px-1">
          {items.map((item) => (
            <ResultCard key={item.id} item={item} clickedAppearanceId={clickedAppearanceId} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
});

const ResultCard = memo(function ResultCard({ item, clickedAppearanceId }: { item: SearchResultItemData; clickedAppearanceId?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (!clickedAppearanceId || clickedAppearanceId !== item.id) {
      setIsPulsing(false);
      return;
    }

    setIsPulsing(true);

    const timeoutId = window.setTimeout(() => {
      setIsPulsing(false);
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [clickedAppearanceId, item.id]);

  const handleSearchResultClick = useCallback(async () => {
    //TODO: fix this to get the value directly from bottom input hook or something
    const inputEl = document.getElementById("bottom-input") as HTMLInputElement | null;
    const query = inputEl?.value ?? "";

    try {
      // Ensure the chapter window is mounted before attempting to scroll
      await ensureChapterWindow(item.chapter);
      await goToParagraph({ currentChapter: item.chapter, currentParagraph: item.paragraphNumber }, { behavior: "instant" });
      highlightSearchInParagraph(item.chapter, item.paragraphNumber, query);
    } catch (error) {
      console.warn("Failed to scroll to search result:", error);
    }
  }, [item.chapter, item.paragraphNumber]);

  const animationStyle = isPulsing ? { animation: "pulse-appearance 1.8s ease-out" } : undefined;

  return (
    <div
      className={cn(
        "group relative overflow-hidden cursor-pointer rounded-xl border border-book-primary-20 bg-gradient-to-br from-book-primary-5 to-book-secondary-5 hover:from-book-primary-10 hover:to-book-secondary-10 transition-all duration-200",
      )}
      onClick={handleSearchResultClick}
      data-appearance-id={item.id}
      ref={cardRef}
      style={animationStyle}
    >
      <div className="relative p-4">
        <div className="flex items-center gap-2 mb-2">
          {item.type && <div className="px-2 py-1 rounded-md text-xs font-medium bg-book-tertiary-30 text-book-tertiary">{item.type}</div>}
          <div className="px-2 py-1 rounded-md text-xs font-medium bg-book-primary-30 text-book-primary">
            {item.percentInChapter}% of Chapter {item.chapter}
          </div>
        </div>

        {item.text && (
          <div className="mb-2 text-sm italic text-white/70 p-2 rounded-md bg-book-secondary-20">
            <div className="flex items-start gap-2">
              <span dangerouslySetInnerHTML={{ __html: item.text }} />
            </div>
          </div>
        )}

        <div className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap line-clamp-9 md:line-clamp-6">
          <span dangerouslySetInnerHTML={{ __html: item.summary }} />
        </div>
      </div>
    </div>
  );
});

const variants = {
  loading: { initial: { rotate: 0 }, animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity } } },
  loadingContainer: { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } },
  loadingText: { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { delay: 0.2 } } },
  loadingSubtext: { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { delay: 0.4 } } },
} as const;
