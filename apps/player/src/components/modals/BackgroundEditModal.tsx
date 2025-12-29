import React, { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

import { useBookConvex } from "@player/context/BookConvexContext";
import { useBackgroundEditModal } from "@player/stores/modals/backgroundEditModal.store";
import ModalUI from "./ModalUI";

const BackgroundEditModal: React.FC = () => {
  const { book } = useBookConvex();
  const { isOpen, cueId, fileBasename, currentBackgroundUrl, closeModal } = useBackgroundEditModal();

  const startBackgroundEdit = useAction(api.backgroundEditing.startBackgroundEdit);

  const [instructions, setInstructions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !cueId || !fileBasename) return null;

  const handleSubmit = async () => {
    if (!book?.path || !instructions.trim()) {
      console.error("[BackgroundEditModal] Cannot submit: missing book path or instructions", { bookPath: book?.path, instructions });
      return;
    }

    console.log("[BackgroundEditModal] Starting background edit", { bookPath: book.path, cueId, fileBasename, instructions: instructions.trim() });

    setIsSubmitting(true);
    closeModal();

    try {
      await startBackgroundEdit({ bookPath: book.path, cueId: cueId as Id<"backgroundCues">, fileBasename, instructions: instructions.trim() });
      console.log("[BackgroundEditModal] Background edit action scheduled successfully");
    } catch (err) {
      console.error("[BackgroundEditModal] Failed to start background edit:", err);
    }
  };

  return (
    <ModalUI title="Edit Background" onClose={closeModal}>
      <div className="w-96 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2">
          {currentBackgroundUrl ? (
            <img src={currentBackgroundUrl} alt={fileBasename} className="w-full h-40 rounded-lg object-cover border border-zinc-600" />
          ) : (
            <div className="w-full h-40 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-400">No preview</div>
          )}
          <div className="text-white font-medium text-sm">{fileBasename}</div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-xs text-zinc-400">Describe how you want to modify this background:</div>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g., Make it nighttime with stars, add fog..."
            className="w-full h-24 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
            disabled={isSubmitting}
          />
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !instructions.trim()}
            className="w-full bg-purple-600 text-white hover:bg-purple-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Starting..." : "Generate Edited Background"}
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

export default BackgroundEditModal;
