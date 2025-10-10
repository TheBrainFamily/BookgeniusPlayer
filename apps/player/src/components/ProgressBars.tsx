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
          {/* Chapter Progress - Top Bar */}
          <motion.div
            variants={progressVariants}
            initial="hidden"
            animate="visible"
            className="fixed inset-x-0 top-0 h-[10px] z-[49] pointer-events-none"
            style={{ backgroundColor: "color-mix(in srgb, var(--bg-content-light, #8B4513) 20%, transparent)" }}
          >
            <motion.div
              className="h-full w-full origin-left transform-gpu [will-change:transform]"
              style={{
                scaleX: chapterX,
                background:
                  "linear-gradient(to right, color-mix(in srgb, var(--bg-content-light, #CD853F) 45%, transparent), color-mix(in srgb, var(--bg-content-light, #F4A460) 65%, transparent))",
                opacity: 0.8,
              }}
            />
          </motion.div>

          {/* Furthest Progress - Bottom Bar (Background) */}
          <motion.div
            variants={progressVariants}
            initial="hidden"
            animate="visible"
            className="fixed inset-x-0 bottom-0 h-[10px] z-[48] pointer-events-none"
            style={{ backgroundColor: "color-mix(in srgb, var(--bg-content-light, #8B4513) 20%, transparent)" }}
          >
            <motion.div
              className="h-full w-full origin-left transform-gpu [will-change:transform]"
              style={{
                scaleX: furthestX,
                background:
                  "linear-gradient(to right, color-mix(in srgb, var(--bg-content-light, #666666) 30%, transparent), color-mix(in srgb, var(--bg-content-light, #999999) 40%, transparent))",
                opacity: 0.5,
              }}
            />
          </motion.div>

          {/* Book Progress - Bottom Bar (Foreground) */}
          <motion.div
            variants={progressVariants}
            initial="hidden"
            animate="visible"
            className="fixed inset-x-0 bottom-0 h-[10px] z-[49] pointer-events-none"
            style={{ backgroundColor: "transparent" }}
          >
            <motion.div
              className="h-full w-full origin-left transform-gpu [will-change:transform]"
              style={{
                scaleX: bookX,
                background:
                  "linear-gradient(to right, color-mix(in srgb, var(--bg-content-light, #A0522D) 45%, transparent), color-mix(in srgb, var(--bg-content-light, #CD853F) 65%, transparent))",
                opacity: 0.7,
              }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const progressVariants: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 3, delay: 0.5 } } };

export default ProgressBars;
