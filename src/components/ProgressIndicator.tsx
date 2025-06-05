import React from "react";
import { motion, Variants } from "motion/react";

import { useLocationRange } from "@/hooks/useLocationRange";
import { systemNavigateTo, getSavedLocation } from "@/helpers/paragraphsNavigation";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ProgressElement } from "./ProgressElement";
import { getBookData } from "@/genericBookDataGetters/getBookData";

const ProgressIndicator: React.FC = () => {
  const {
    debouncedLocation: { currentChapter },
  } = useLocationRange();
  const { currentChapter: furthestChapter } = getSavedLocation();
  const bookData = getBookData();

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
        return "bg-white shadow-md border-2 border-white";
      case "furthest":
        return "bg-blue-400 shadow-md border-2 border-white";
      case "completed":
        return "bg-green-400 shadow-md border-2 border-white";
      default:
        return "bg-gray-400 shadow-md border-2 border-gray-400";
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
                className={cn(`absolute -top-1 rounded-4xl h-[14px] w-[14px] z-10 ${colorClass} transition-all cursor-pointer`, i === 1 && "translate-x-[1px]")}
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
    <ProgressElement>
      <motion.div className="my-1 h-4 overflow-hidden progress-indicator content-center" variants={variants.container} initial="hidden" animate="visible">
        <motion.div className={cn("relative h-2 bg-black/70 textured-bg border shadow-xl text-white border-white/30 rounded-3xl")}>
          <motion.div
            className="h-full bg-gradient-to-r from-yellow-400/80 via-lime-500/80 to-green-500/80 rounded-full"
            variants={variants.progressBar}
            style={{ width: `${Math.max(0, totalProgress)}%` }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
          />
          {renderChapterMarkers()}
        </motion.div>
      </motion.div>
    </ProgressElement>
  );
};

const variants: Record<string, Variants> = {
  container: { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut", staggerChildren: 0.1 } } },
  progressBar: { hidden: { scaleX: 0 }, visible: { scaleX: 1, transition: { duration: 1, ease: "easeOut", delay: 0.2 } } },
};

export default ProgressIndicator;
