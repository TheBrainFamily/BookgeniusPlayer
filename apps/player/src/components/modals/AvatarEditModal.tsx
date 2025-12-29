import React, { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useBookConvex } from "@player/context/BookConvexContext";
import { useAvatarEditModal } from "@player/stores/modals/avatarEditModal.store";
import { useAvatarGenerationStore } from "@player/stores/avatarGeneration.store";
import ModalUI from "./ModalUI";

type TabType = "edit" | "regenerate";

const AvatarEditModal: React.FC = () => {
  const { book } = useBookConvex();
  const { isOpen, characterSlug, characterDisplayName, currentAvatarUrl, aiPrompt, closeModal } = useAvatarEditModal();
  const { startOptimisticGeneration } = useAvatarGenerationStore();

  const startAvatarEdit = useAction(api.avatarEditing.startAvatarEdit);
  const startAvatarGeneration = useAction(api.avatarGeneration.startAvatarGeneration);

  const [activeTab, setActiveTab] = useState<TabType>("edit");
  const [instructions, setInstructions] = useState("");
  const [editablePrompt, setEditablePrompt] = useState(aiPrompt || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen || !characterSlug || !characterDisplayName) return null;

  const handleEditSubmit = async () => {
    if (!book?.path || !instructions.trim()) return;

    setIsSubmitting(true);
    setError("");
    startOptimisticGeneration(characterSlug, characterDisplayName);
    closeModal();

    try {
      await startAvatarEdit({ bookPath: book.path, characterSlug, characterDisplayName, instructions: instructions.trim() });
    } catch (err) {
      console.error("Failed to start avatar edit:", err);
    }
  };

  const handleRegenerateSubmit = async () => {
    if (!book?.path || !editablePrompt.trim()) return;

    setIsSubmitting(true);
    setError("");
    startOptimisticGeneration(characterSlug, characterDisplayName);
    closeModal();

    try {
      await startAvatarGeneration({ bookPath: book.path, characterSlug, characterDisplayName, visualPrompt: editablePrompt.trim() });
    } catch (err) {
      console.error("Failed to start avatar regeneration:", err);
    }
  };

  return (
    <ModalUI title="Change Character Avatar" onClose={closeModal}>
      <div className="w-96 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2">
          {currentAvatarUrl ? (
            <img src={currentAvatarUrl} alt={characterDisplayName} className="w-32 h-32 rounded-full object-cover border-2 border-zinc-600" />
          ) : (
            <div className="w-32 h-32 rounded-full bg-zinc-700 flex items-center justify-center text-4xl text-zinc-400">{characterDisplayName.charAt(0)}</div>
          )}
          <div className="text-white font-medium">{characterDisplayName}</div>
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg">
          <button
            onClick={() => setActiveTab("edit")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${activeTab === "edit" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            Edit with AI
          </button>
          <button
            onClick={() => setActiveTab("regenerate")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${activeTab === "regenerate" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            Regenerate
          </button>
        </div>

        {activeTab === "edit" ? (
          <div className="flex flex-col gap-3">
            <div className="text-xs text-zinc-400">Describe how you want to modify the current avatar:</div>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g., Make them look older, add gray hair and wrinkles..."
              className="w-full h-24 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
              disabled={isSubmitting}
            />
            <button
              onClick={handleEditSubmit}
              disabled={isSubmitting || !instructions.trim()}
              className="w-full bg-purple-600 text-white hover:bg-purple-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Starting..." : "Generate Edited Avatars"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-xs text-zinc-400">Edit the visual description or write a new one:</div>
            <textarea
              value={editablePrompt}
              onChange={(e) => setEditablePrompt(e.target.value)}
              placeholder="A detailed description of the character's appearance..."
              className="w-full h-32 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
              disabled={isSubmitting}
            />
            <button
              onClick={handleRegenerateSubmit}
              disabled={isSubmitting || !editablePrompt.trim()}
              className="w-full bg-amber-600 text-white hover:bg-amber-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Starting..." : "Regenerate Avatars"}
            </button>
          </div>
        )}

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

export default AvatarEditModal;
