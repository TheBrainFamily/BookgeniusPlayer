import React, { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";

import { useBookConvex } from "@player/context/BookConvexContext";
import { useBackgroundAddModal } from "@player/stores/modals/backgroundAddModal.store";
import { useBackgroundGenerationStore, createBackgroundKey } from "@player/stores/backgroundGeneration.store";
import ModalUI from "./ModalUI";

const BackgroundAddModal: React.FC = () => {
  const { book } = useBookConvex();
  const { isOpen, chapter, paragraph, closeModal } = useBackgroundAddModal();
  const { startGeneration } = useBackgroundGenerationStore();

  const startBackgroundGeneration = useAction(api.backgroundEditing.startBackgroundGeneration);

  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || chapter === null || paragraph === null) return null;

  const handleSubmit = async () => {
    if (!book?.path || !prompt.trim()) {
      console.error("[BackgroundAddModal] Cannot submit: missing book path or prompt", { bookPath: book?.path, prompt });
      return;
    }

    setIsSubmitting(true);

    const key = createBackgroundKey(chapter, paragraph);
    startGeneration(key, { chapter, paragraph, prompt: prompt.trim(), type: "add" });
    closeModal();

    try {
      await startBackgroundGeneration({ bookPath: book.path, chapter, paragraph, prompt: prompt.trim() });
    } catch (err) {
      console.error("[BackgroundAddModal] Failed to start background generation:", err);
    }
  };

  return (
    <ModalUI title="Add Background Here" onClose={closeModal}>
      <div className="w-96 flex flex-col gap-4">
        <div className="text-center text-zinc-400 text-sm">
          Adding background at Chapter {chapter}, Paragraph {paragraph}
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-xs text-zinc-400">Describe the scene you want. Context from surrounding paragraphs will be added automatically.</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., A dark castle at night with lightning in the sky..."
            className="w-full h-32 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
            disabled={isSubmitting}
          />
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !prompt.trim()}
            className="w-full bg-purple-600 text-white hover:bg-purple-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Starting..." : "Generate Background"}
          </button>
        </div>

        <button
          onClick={closeModal}
          disabled={isSubmitting}
          className="w-full bg-zinc-700 text-white hover:bg-zinc-600 h-10 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </ModalUI>
  );
};

export default BackgroundAddModal;
