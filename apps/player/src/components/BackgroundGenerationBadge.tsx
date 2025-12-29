import React, { useState, useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { motion, AnimatePresence } from "motion/react";

import { useBookConvex } from "@player/context/BookConvexContext";
import { useBackgroundGenerationStore, GeneratingBackground, ReadyBackground, createBackgroundKey } from "@player/stores/backgroundGeneration.store";

const GeneratingBanner: React.FC<{ bg: GeneratingBackground }> = ({ bg }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 20, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9, y: -10 }}
    transition={{ type: "spring", stiffness: 300, damping: 25 }}
    className="flex items-center gap-3 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-full px-4 py-2 shadow-lg"
  >
    <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    <span className="text-sm text-zinc-300">
      {bg.type === "add" ? "Generating" : "Editing"} background at Ch {bg.chapter}, P {bg.paragraph}...
    </span>
  </motion.div>
);

const ReadyBanner: React.FC<{ bg: ReadyBackground; onClick: () => void }> = ({ bg, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: isHovered ? 1.03 : 1 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative flex items-center gap-3 bg-gradient-to-r from-emerald-900/95 to-green-900/95 backdrop-blur-md border border-emerald-500/50 rounded-full px-4 py-2.5 shadow-lg cursor-pointer"
      style={{ boxShadow: "0 0 20px rgba(16, 185, 129, 0.3), 0 0 40px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(255,255,255,0.1)" }}
    >
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        animate={{
          boxShadow: [
            "0 0 15px rgba(16, 185, 129, 0.4), 0 0 30px rgba(16, 185, 129, 0.2)",
            "0 0 25px rgba(16, 185, 129, 0.6), 0 0 50px rgba(16, 185, 129, 0.3)",
            "0 0 15px rgba(16, 185, 129, 0.4), 0 0 30px rgba(16, 185, 129, 0.2)",
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />

      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>

      <span className="relative text-sm font-medium text-emerald-50">
        Background ready at{" "}
        <span className="font-semibold">
          Ch {bg.chapter}, P {bg.paragraph}
        </span>
      </span>

      <motion.div className="ml-1" animate={{ x: isHovered ? 2 : 0 }} transition={{ type: "spring", stiffness: 400 }}>
        <svg className="w-4 h-4 text-emerald-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </motion.div>
    </motion.button>
  );
};

interface BackgroundOptionsModalProps {
  bg: ReadyBackground;
  bgKey: string;
  onClose: () => void;
}

const BackgroundOptionsModal: React.FC<BackgroundOptionsModalProps> = ({ bg, bgKey, onClose }) => {
  const { book, backgroundsForBook } = useBookConvex();
  const startBackgroundGeneration = useAction(api.backgroundEditing.startBackgroundGeneration);
  const { startGeneration, dismissReady, completeGeneration } = useBackgroundGenerationStore();

  const [prompt, setPrompt] = useState(bg.prompt);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const backgroundUrl = backgroundsForBook.find((b) => b.chapter === bg.chapter && b.paragraph === bg.paragraph)?.file;

  const handleRegenerate = async () => {
    if (!book?.path || !prompt.trim()) return;

    setIsSubmitting(true);
    dismissReady(bgKey);

    const newKey = createBackgroundKey(bg.chapter, bg.paragraph);
    startGeneration(newKey, { chapter: bg.chapter, paragraph: bg.paragraph, prompt: prompt.trim(), type: "add" });

    try {
      await startBackgroundGeneration({ bookPath: book.path, chapter: bg.chapter, paragraph: bg.paragraph, prompt: prompt.trim() });
      onClose();
    } catch (err) {
      console.error("Failed to regenerate background:", err);
      completeGeneration(newKey);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-900 rounded-2xl border border-zinc-700 p-8 w-full h-full max-w-6xl max-h-[90vh] shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-white">Background Ready</h2>
            <p className="text-zinc-400 text-sm mt-1">
              Chapter {bg.chapter}, Paragraph {bg.paragraph}
            </p>
          </div>
        </div>

        {backgroundUrl && (
          <div className="flex-1 min-h-0 mb-6 rounded-xl overflow-hidden border border-zinc-700">
            <img src={backgroundUrl} alt="Generated background" className="w-full h-full object-contain bg-black" />
          </div>
        )}

        <div>
          <label className="text-xs text-zinc-400 mb-2 block">Not happy? Modify the prompt and regenerate:</label>
          <div className="flex gap-6 items-center">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the scene..."
              className="flex-1 h-20 bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
              disabled={isSubmitting}
            />
            <div className="flex gap-3">
              <button
                onClick={handleRegenerate}
                disabled={isSubmitting || !prompt.trim()}
                className="bg-zinc-700 text-white hover:bg-zinc-600 h-12 px-6 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {isSubmitting ? "Starting..." : "Regenerate"}
              </button>
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="bg-emerald-600 text-white hover:bg-emerald-500 h-12 px-8 rounded-lg cursor-pointer disabled:opacity-50 transition-colors font-medium whitespace-nowrap"
              >
                Keep Background
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const BackgroundGenerationBadge: React.FC = () => {
  const { backgroundsForBook } = useBookConvex();
  const { generatingBackgrounds, readyBackgrounds, completeGeneration, dismissReady } = useBackgroundGenerationStore();
  const [selectedBg, setSelectedBg] = useState<{ bg: ReadyBackground; key: string } | null>(null);

  const prevBackgroundsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentKeys = new Set(backgroundsForBook.map((b) => createBackgroundKey(b.chapter, b.paragraph)));

    for (const [key] of generatingBackgrounds) {
      if (currentKeys.has(key) && !prevBackgroundsRef.current.has(key)) {
        completeGeneration(key);
      }
    }

    prevBackgroundsRef.current = currentKeys;
  }, [backgroundsForBook, generatingBackgrounds, completeGeneration]);

  const generatingList = Array.from(generatingBackgrounds.entries());
  const readyList = Array.from(readyBackgrounds.entries());

  if (generatingList.length === 0 && readyList.length === 0) return null;

  const handleReadyClick = (key: string, bg: ReadyBackground) => {
    setSelectedBg({ key, bg });
  };

  const handleCloseModal = () => {
    if (selectedBg) {
      dismissReady(selectedBg.key);
    }
    setSelectedBg(null);
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {generatingList.map(([key, bg]) => (
            <GeneratingBanner key={`gen-${key}`} bg={bg} />
          ))}
          {readyList.map(([key, bg]) => (
            <ReadyBanner key={`ready-${key}`} bg={bg} onClick={() => handleReadyClick(key, bg)} />
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>{selectedBg && <BackgroundOptionsModal bg={selectedBg.bg} bgKey={selectedBg.key} onClose={handleCloseModal} />}</AnimatePresence>
    </>
  );
};
