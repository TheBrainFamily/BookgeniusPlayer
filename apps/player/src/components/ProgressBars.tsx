import React, { useState, useEffect } from "react";
import { AnimatePresence, motion, Variants, useSpring } from "motion/react";

import { useReadingProgress } from "@player/hooks/useReadingProgress";
import { bookIndex } from "@player/logic/BookIndex";
import useSplashHidden from "@player/hooks/useSplashHidden";

export interface ChapterStructure {
  chapterNumber: number;
  paragraphCount: number;
}

const ProgressBars: React.FC = () => {
  const isSplashHidden = useSplashHidden();

  const [chaptersStructure, setChaptersStructure] = useState<ChapterStructure[]>([]);
  const [totalParagraphs, setTotalParagraphs] = useState(0);

  const { chapterProgress, bookProgress, furthestProgress } = useReadingProgress(chaptersStructure, totalParagraphs);

  useEffect(() => {
    try {
      bookIndex.ensureInitialized();
      const structure = bookIndex.getChaptersStructure();
      const total = structure.reduce((sum, entry) => sum + entry.paragraphCount, 0);

      setChaptersStructure(structure);
      setTotalParagraphs(total);
    } catch (error) {
      console.error("❌ Error preparing chapters structure:", error);
    }
  }, []);

  // Smooth springs for progress values (avoid CSS transform transitions)
  const chapterX = useSpring(chapterProgress / 100, { stiffness: 200, damping: 30 });
  const bookX = useSpring(bookProgress / 100, { stiffness: 200, damping: 30 });
  const furthestX = useSpring(furthestProgress / 100, { stiffness: 200, damping: 30 });

  useEffect(() => {
    chapterX.set(chapterProgress / 100);
  }, [chapterProgress, chapterX]);
  useEffect(() => {
    bookX.set(bookProgress / 100);
  }, [bookProgress, bookX]);
  useEffect(() => {
    furthestX.set(furthestProgress / 100);
  }, [furthestProgress, furthestX]);

  if (chaptersStructure.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      {isSplashHidden && (
        <>
          <motion.div variants={progressVariants} initial="hidden" animate="visible" className="fixed inset-x-0 top-0 h-[10px] bg-[rgba(139,69,19,0.2)] z-[49] pointer-events-none">
            <motion.div
              className="h-full w-full bg-gradient-to-r from-[#8B4513] to-[#CD853F] opacity-70 origin-left transform-gpu [will-change:transform]"
              style={{ scaleX: chapterX }}
            />
          </motion.div>

          <motion.div
            variants={progressVariants}
            initial="hidden"
            animate="visible"
            className="fixed inset-x-0 bottom-0 h-[10px] bg-[rgba(139,69,19,0.2)] z-[48] pointer-events-none"
          >
            <motion.div
              className="h-full w-full bg-gradient-to-r from-[#88888830] to-[#bbbbbb30] origin-left transform-gpu [will-change:transform]"
              style={{ scaleX: furthestX }}
            />
          </motion.div>

          <motion.div
            variants={progressVariants}
            initial="hidden"
            animate="visible"
            className="fixed inset-x-0 bottom-0 h-[10px] bg-[rgba(139,69,19,0.2)] z-[49] pointer-events-none"
          >
            <motion.div
              className="h-full w-full bg-gradient-to-r from-[#A0522D] to-[#F4A460] opacity-70 origin-left transform-gpu [will-change:transform]"
              style={{ scaleX: bookX }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const progressVariants: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 3, delay: 0.5 } } };

export default ProgressBars;
