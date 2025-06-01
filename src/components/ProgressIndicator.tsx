import React from "react";
import { BookOpen } from "lucide-react";
import { motion, Variants } from "motion/react";

import { BookData } from "../booksData/types";
import { useLocationRange } from "@/hooks/useLocationRange";
import { systemNavigateTo, getSavedLocation } from "@/helpers/paragraphsNavigation";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface BookProgressIndicatorProps {
  bookData: BookData;
}

const containerVariants: Variants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut", staggerChildren: 0.1 } } };
const progressBarVariants: Variants = { hidden: { scaleX: 0 }, visible: { scaleX: 1, transition: { duration: 1, ease: "easeOut", delay: 0.2 } } };

const ProgressIndicator: React.FC<BookProgressIndicatorProps> = ({ bookData }) => {
  const {
    debouncedLocation: { currentChapter, currentParagraph },
  } = useLocationRange();
  const { currentChapter: furthestChapter } = getSavedLocation();

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

  return <></>;
  return (
    <motion.div
      className="bg-black/70 textured-bg border shadow-xl text-white border-white/30 w-full rounded-3xl p-5 py-3 flex flex-col gap-1 md:gap-2 lg:gap-3"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div className="flex items-center justify-between" variants={containerVariants}>
        <motion.div className="flex items-center gap-2" variants={containerVariants}>
          <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>
            <BookOpen className="h-4 w-4 text-amber-600" />
          </motion.div>
          <span className="text-xs font-medium">Progres czytania</span>
        </motion.div>
        <motion.div className="text-xs text-gray-300" variants={containerVariants}>
          Rozdział {currentChapter} z {totalChapters}
        </motion.div>
      </motion.div>

      <motion.div className="relative h-3 bg-gray-200/20 rounded-full overflow-hidden backdrop-blur-sm" variants={containerVariants}>
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

      <motion.div className="text-xs text-gray-400 text-center flex justify-between items-center" variants={containerVariants}>
        <motion.span key={Math.round(totalProgress)} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
          {Math.round(totalProgress)}% ukończone
        </motion.span>
        {currentParagraph > 0 && (
          <motion.span initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.4, delay: 0.5 }} className="text-blue-300">
            Paragraf {currentParagraph}
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  );
};

export default ProgressIndicator;
