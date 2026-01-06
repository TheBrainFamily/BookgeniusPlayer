import React, { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { type Id } from "@convex/_generated/dataModel";
import { motion, AnimatePresence } from "motion/react";

import { useBookConvex } from "@player/context/BookConvexContext";
import { useBackgroundEditModal } from "@player/stores/modals/backgroundEditModal.store";
import {
  useBackgroundGenerationStore,
  createBackgroundKey,
} from "@player/stores/backgroundGeneration.store";

const BackgroundEditModal: React.FC = () => {
  const { book } = useBookConvex();
  const { isOpen, cueId, fileBasename, chapter, paragraph, currentBackgroundUrl, closeModal } =
    useBackgroundEditModal();
  const { startGeneration } = useBackgroundGenerationStore();

  const startBackgroundEdit = useAction(api.backgroundEditing.startBackgroundEdit);

  const [instructions, setInstructions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !cueId || !fileBasename || chapter === null || paragraph === null) return null;

  const handleSubmit = async () => {
    if (!book?.path || !instructions.trim()) {
      console.error("[BackgroundEditModal] Cannot submit: missing book path or instructions", {
        bookPath: book?.path,
        instructions,
      });
      return;
    }

    setIsSubmitting(true);

    const key = createBackgroundKey(chapter, paragraph);
    startGeneration(key, { chapter, paragraph, prompt: instructions.trim(), type: "edit" });
    closeModal();

    try {
      await startBackgroundEdit({
        bookPath: book.path,
        cueId: cueId as Id<"backgroundCues">,
        fileBasename,
        instructions: instructions.trim(),
      });
    } catch (err) {
      console.error("[BackgroundEditModal] Failed to start background edit:", err);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-zinc-900 rounded-2xl border border-zinc-700 p-8 w-full h-full max-w-6xl max-h-[90vh] shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-white">Edit Background</h2>
              <p className="text-zinc-400 text-sm mt-1">
                Chapter {chapter}, Paragraph {paragraph}
              </p>
            </div>
            <button
              onClick={closeModal}
              disabled={isSubmitting}
              className="text-zinc-400 hover:text-white transition-colors p-2"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="flex-1 min-h-0 mb-6 rounded-xl overflow-hidden border border-zinc-700">
            {currentBackgroundUrl ? (
              <img
                src={currentBackgroundUrl}
                alt={fileBasename}
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                No preview available
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-2 block">
              Describe how you want to modify this background:
            </label>
            <div className="flex gap-6 items-center">
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., Make it nighttime with stars, add fog..."
                className="flex-1 h-20 bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
                disabled={isSubmitting}
              />
              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  disabled={isSubmitting}
                  className="bg-zinc-700 text-white hover:bg-zinc-600 h-12 px-6 rounded-lg cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !instructions.trim()}
                  className="bg-purple-600 text-white hover:bg-purple-500 h-12 px-8 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium whitespace-nowrap"
                >
                  {isSubmitting ? "Starting..." : "Edit Background"}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default BackgroundEditModal;
