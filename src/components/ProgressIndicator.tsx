import React, { useEffect, useState } from "react";
import { motion, Variants } from "motion/react";

import { BookData } from "../booksData/types";
import { useLocationRange } from "@/hooks/useLocationRange";
import { systemNavigateTo, getSavedLocation } from "@/helpers/paragraphsNavigation";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface BookProgressIndicatorProps {
  bookData: BookData;
}

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut", staggerChildren: 0.1 } },
  scrollVisible: { opacity: 1, y: 0, transition: { duration: 0.1, ease: "easeOut" } },
  scrollHidden: { opacity: 0, y: 0, transition: { duration: 0.3, ease: "easeIn" } },
};
const progressBarVariants: Variants = { hidden: { scaleX: 0 }, visible: { scaleX: 1, transition: { duration: 1, ease: "easeOut", delay: 0.2 } } };

const ProgressIndicator: React.FC<BookProgressIndicatorProps> = ({ bookData }) => {
  const [isScrollVisible, setIsScrollVisible] = useState(true);
  const [scrollTimer, setScrollTimer] = useState<NodeJS.Timeout | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const {
    debouncedLocation: { currentChapter },
  } = useLocationRange();
  const { currentChapter: furthestChapter } = getSavedLocation();

  // Handle initial visibility and scroll-based visibility
  useEffect(() => {
    // Show initially and set initialized
    setIsInitialized(true);

    const handleScroll = () => {
      // Show immediately on scroll
      setIsScrollVisible(true);

      // Clear existing timer
      if (scrollTimer) {
        clearTimeout(scrollTimer);
      }

      // Hide after 1.5 seconds of no scrolling (reduced from 2 seconds)
      const newTimer = setTimeout(() => {
        setIsScrollVisible(false);
      }, 1500);

      setScrollTimer(newTimer);
    };

    // Add scroll listeners
    document.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });

    // Cleanup
    return () => {
      document.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimer) {
        clearTimeout(scrollTimer);
      }
    };
  }, [scrollTimer]);

  const totalChapters = bookData.chapters;

  const completedChapters = Math.max(0, furthestChapter - 1);
  const chapterProgress = (completedChapters / totalChapters) * 100;
  const totalProgress = Math.min(100, chapterProgress);

  const handleChapterClick = (chapterNumber: number) => {
    systemNavigateTo({ currentChapter: chapterNumber, currentParagraph: 0 });
  };

  const getChapterStatus = (chapterNum: number) => {
    if (chapterNum === currentChapter) return "current";
    if (chapterNum === furthestChapter && chapterNum !== currentChapter) return "furthest";
    if (chapterNum < furthestChapter) return "completed";
    return "locked";
  };

  const getChapterColor = (status: string) => {
    switch (status) {
      case "current":
        return "bg-blue-400 shadow-lg border border-blue-300";
      case "furthest":
        return "bg-green-400 shadow-md border border-green-300";
      case "completed":
        return "bg-amber-400/80 hover:bg-amber-300 border border-amber-300/50";
      default:
        return "bg-gray-500 hover:bg-gray-400 border border-gray-400/50";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "current":
        return "Aktualny rozdział";
      case "furthest":
        return "Najdalej przeczytane";
      case "completed":
        return "Ukończony rozdział";
      default:
        return "";
    }
  };

  const renderChapterMarkers = () => {
    const markers = [];
    for (let i = 0; i <= totalChapters; i++) {
      const position = ((i - 1) / totalChapters) * 100;
      const status = getChapterStatus(i);
      const colorClass = getChapterColor(status);
      const statusText = getStatusText(status);

      markers.push(
        <TooltipProvider key={i} delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                onClick={() => handleChapterClick(i)}
                className={cn(`absolute top-0 h-full w-[7px] z-10 ${colorClass} transition-all cursor-pointer`, i === 1 && "translate-x-[1px]")}
                style={{ left: `${position}%` }}
                custom={i}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-black/90 text-white border-white/20">
              <div className="text-center">
                <div className="font-semibold">Rozdział {i}</div>
                <div className="text-xs text-gray-300">{statusText}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>,
      );
    }
    return markers;
  };

  // return <></>;
  return (
    <motion.div
      className={cn("relative h-2 bg-black/70 textured-bg border shadow-xl text-white border-white/30 rounded-3xl overflow-hidden mx-3", "progress-indicator")}
      variants={containerVariants}
      initial="hidden"
      animate={isInitialized ? (isScrollVisible ? "scrollVisible" : "scrollHidden") : "visible"}
    >
      <motion.div
        className="h-full bg-gradient-to-r from-amber-500/80 via-orange-500/80 to-red-500/80 rounded-full"
        variants={progressBarVariants}
        style={{ width: `${Math.max(0, totalProgress)}%` }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
      />
      {renderChapterMarkers()}
    </motion.div>
  );
};

export default ProgressIndicator;
