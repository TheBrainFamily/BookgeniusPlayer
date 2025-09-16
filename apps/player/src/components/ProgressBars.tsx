import React, { useState, useEffect } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";

import { useReadingProgress } from "@player/hooks/useReadingProgress";
import { getBookStringified } from "@player/genericBookDataGetters/getBookStringified";
import useSplashHidden from "@player/hooks/useSplashHidden";

export interface ChapterStructure {
  chapterNumber: number;
  paragraphCount: number;
}

function useRafNumber(target: number) {
  const [val, setVal] = useState(target);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVal(target));
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return val;
}

const ProgressBars: React.FC = () => {
  const isSplashHidden = useSplashHidden();

  const [chaptersStructure, setChaptersStructure] = useState<ChapterStructure[]>([]);
  const [totalParagraphs, setTotalParagraphs] = useState(0);

  const { chapterProgress, bookProgress, furthestProgress } = useReadingProgress(chaptersStructure, totalParagraphs);

  useEffect(() => {
    try {
      const bookDataString = getBookStringified();
      const parser = new window.DOMParser();
      const htmlDoc = parser.parseFromString(bookDataString, "text/html");

      const chapters = Array.from(htmlDoc.querySelectorAll("section[data-chapter]"));
      const structure: ChapterStructure[] = [];
      let total = 0;

      chapters.forEach((chapter) => {
        const chapterNumber = parseInt(chapter.getAttribute("data-chapter") || "0");
        const paragraphCount = chapter.querySelectorAll("[data-index]").length;

        structure.push({ chapterNumber, paragraphCount });
        total += paragraphCount;
      });

      setChaptersStructure(structure);
      setTotalParagraphs(total);
    } catch (error) {
      console.error("❌ Error parsing book data:", error);
    }
  }, []);

  const chapterTarget = useRafNumber(chapterProgress / 100);
  const bookTarget = useRafNumber(bookProgress / 100);
  const furthestTarget = useRafNumber(furthestProgress / 100);

  if (chaptersStructure.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      {isSplashHidden && (
        <>
          <motion.div variants={progressVariants} initial="hidden" animate="visible" className="fixed inset-x-0 top-0 h-[10px] bg-[rgba(139,69,19,0.2)] z-[49] pointer-events-none">
            <motion.div
              className="h-full w-full bg-gradient-to-r from-[#8B4513] to-[#CD853F] opacity-70 origin-left transform-gpu transition-transform duration-300 ease-in-out [will-change:transform]"
              animate={{ scaleX: chapterTarget }}
            />
          </motion.div>

          <motion.div
            variants={progressVariants}
            initial="hidden"
            animate="visible"
            className="fixed inset-x-0 bottom-0 h-[10px] bg-[rgba(139,69,19,0.2)] z-[48] pointer-events-none"
          >
            <motion.div
              className="h-full w-full bg-gradient-to-r from-[#88888830] to-[#bbbbbb30] origin-left transform-gpu transition-transform duration-300 ease-in-out [will-change:transform]"
              animate={{ scaleX: furthestTarget }}
            />
          </motion.div>

          <motion.div
            variants={progressVariants}
            initial="hidden"
            animate="visible"
            className="fixed inset-x-0 bottom-0 h-[10px] bg-[rgba(139,69,19,0.2)] z-[49] pointer-events-none"
          >
            <motion.div
              className="h-full w-full bg-gradient-to-r from-[#A0522D] to-[#F4A460] opacity-70 origin-left transform-gpu transition-transform duration-300 ease-in-out [will-change:transform]"
              animate={{ scaleX: bookTarget }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const progressVariants: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 3, delay: 0.5 } } };

export default ProgressBars;
