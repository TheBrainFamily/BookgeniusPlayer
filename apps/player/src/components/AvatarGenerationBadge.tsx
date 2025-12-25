import React, { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useBookConvex, CharacterBundle } from "@player/context/BookConvexContext";

interface AvatarPickerModalProps {
  character: CharacterBundle;
  onClose: () => void;
}

const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({ character, onClose }) => {
  const { book } = useBookConvex();
  const confirmAvatarSelection = useAction(api.avatarGeneration.confirmAvatarSelection);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proposalUrls = character.extra?.avatarProposalUrls || [];

  const handleConfirm = async () => {
    if (!selectedUrl || !book?.path) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await confirmAvatarSelection({ bookPath: book.path, characterSlug: character.slug, selectedOptionUrl: selectedUrl });

      if (result.success) {
        onClose();
      } else {
        setError(result.error || "Failed to save avatar");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save avatar");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 max-w-md w-full mx-4 shadow-2xl">
        <h2 className="text-xl font-semibold text-white mb-2">Choose Avatar</h2>
        <p className="text-zinc-400 text-sm mb-4">Select an avatar for {character.extra?.displayName || character.name}</p>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="grid grid-cols-2 gap-4 mb-6">
          {proposalUrls.map((url, index) => (
            <button
              key={index}
              onClick={() => setSelectedUrl(url)}
              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                selectedUrl === url ? "border-purple-500 ring-2 ring-purple-500/50" : "border-zinc-600 hover:border-zinc-500"
              }`}
            >
              <img src={url} alt={`Option ${index + 1}`} className="w-full aspect-square object-cover" />
              {selectedUrl === url && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 bg-zinc-700 text-white hover:bg-zinc-600 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedUrl || isSubmitting}
            className="flex-1 bg-purple-600 text-white hover:bg-purple-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Saving..." : "Use This Avatar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const AvatarGenerationBadge: React.FC = () => {
  const { characters } = useBookConvex();
  const [showPicker, setShowPicker] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterBundle | null>(null);

  const generatingCharacters = characters.filter((c) => c.extra?.avatarGenerationState === "generating");

  const readyCharacters = characters.filter((c) => c.extra?.avatarGenerationState === "ready" && (c.extra?.avatarProposalUrls?.length ?? 0) > 0);

  const handleReadyClick = (character: CharacterBundle) => {
    setSelectedCharacter(character);
    setShowPicker(true);
  };

  const handleClosePicker = () => {
    setShowPicker(false);
    setSelectedCharacter(null);
  };

  if (generatingCharacters.length === 0 && readyCharacters.length === 0) {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
        {generatingCharacters.map((char) => (
          <div key={char.slug} className="flex items-center gap-3 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-full px-4 py-2 shadow-lg">
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-zinc-300">Generating avatar for {char.extra?.displayName || char.name}...</span>
          </div>
        ))}

        {readyCharacters.map((char) => (
          <button
            key={char.slug}
            onClick={() => handleReadyClick(char)}
            className="flex items-center gap-3 bg-green-900/95 backdrop-blur border border-green-700 rounded-full px-4 py-2 shadow-lg hover:bg-green-800/95 transition-colors cursor-pointer"
          >
            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm text-green-100">Avatar ready for {char.extra?.displayName || char.name}</span>
          </button>
        ))}
      </div>

      {showPicker && selectedCharacter && <AvatarPickerModal character={selectedCharacter} onClose={handleClosePicker} />}
    </>
  );
};
