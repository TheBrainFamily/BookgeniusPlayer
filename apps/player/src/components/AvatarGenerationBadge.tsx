import React, { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useBookConvex, CharacterBundle } from "@player/context/BookConvexContext";
import { useAvatarGenerationStore } from "@player/stores/avatarGeneration.store";
import { motion, AnimatePresence } from "motion/react";

interface AvatarPickerModalProps {
  character: CharacterBundle;
  onClose: () => void;
}

const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({ character, onClose }) => {
  const { book } = useBookConvex();
  const confirmAvatarSelection = useAction(api.avatarGeneration.confirmAvatarSelection);
  const startAvatarGeneration = useAction(api.avatarGeneration.startAvatarGeneration);
  const { setOptimisticAvatar, clearOptimisticAvatar, startOptimisticGeneration } = useAvatarGenerationStore();
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState(character.extra?.aiPrompt || "");
  const [isRegenerating, setIsRegenerating] = useState(false);

  const proposalUrls = character.extra?.avatarProposalUrls || [];
  const displayName = character.extra?.displayName || character.name;

  const handleConfirm = () => {
    if (!selectedUrl || !book?.path) return;

    setOptimisticAvatar(character.slug, selectedUrl);
    onClose();

    confirmAvatarSelection({ bookPath: book.path, characterSlug: character.slug, selectedOptionUrl: selectedUrl })
      .then((result) => {
        if (!result.success) {
          clearOptimisticAvatar(character.slug);
          console.error("Failed to save avatar:", result.error);
        }
      })
      .catch((err) => {
        clearOptimisticAvatar(character.slug);
        console.error("Failed to save avatar:", err);
      });
  };

  const handleRegenerate = async () => {
    if (!book?.path || !editablePrompt.trim()) return;

    setIsRegenerating(true);
    startOptimisticGeneration(character.slug, displayName);
    onClose();

    try {
      await startAvatarGeneration({ bookPath: book.path, characterSlug: character.slug, characterDisplayName: displayName, visualPrompt: editablePrompt.trim() });
    } catch (err) {
      console.error("Failed to start regeneration:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 max-w-md w-full mx-4 shadow-2xl">
        <h2 className="text-xl font-semibold text-white mb-2">Choose Avatar</h2>
        <p className="text-zinc-400 text-sm mb-4">Select an avatar for {displayName}</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
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

        <div className="mb-4">
          <button onClick={() => setShowPromptEditor(!showPromptEditor)} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors">
            <svg className={`w-4 h-4 transition-transform ${showPromptEditor ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Edit prompt to regenerate
          </button>

          {showPromptEditor && (
            <div className="mt-3 space-y-3">
              <textarea
                value={editablePrompt}
                onChange={(e) => setEditablePrompt(e.target.value)}
                placeholder="Character description..."
                className="w-full h-28 bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
              />
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating || !editablePrompt.trim()}
                className="w-full bg-amber-600 text-white hover:bg-amber-500 h-10 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {isRegenerating ? "Starting..." : "Regenerate Avatars"}
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-zinc-700 text-white hover:bg-zinc-600 h-11 px-4 py-2 rounded-lg cursor-pointer transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedUrl}
            className="flex-1 bg-purple-600 text-white hover:bg-purple-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Use This Avatar
          </button>
        </div>
      </div>
    </div>
  );
};

const usePreloadedImages = (urls: string[]) => {
  const [loaded, setLoaded] = useState(false);
  const urlsKey = urls.join(",");

  useEffect(() => {
    if (urls.length === 0) {
      setLoaded(true);
      return;
    }

    setLoaded(false);
    let count = 0;
    const total = urls.length;

    urls.forEach((url) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        count++;
        if (count === total) setLoaded(true);
      };
      img.src = url;
    });
  }, [urlsKey]);

  return loaded;
};

const GeneratingBanner: React.FC<{ character: CharacterBundle }> = ({ character }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 20, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9, y: -10 }}
    transition={{ type: "spring", stiffness: 300, damping: 25 }}
    className="flex items-center gap-3 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-full px-4 py-2 shadow-lg"
  >
    <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    <span className="text-sm text-zinc-300">Generating avatar for {character.extra?.displayName || character.name}...</span>
  </motion.div>
);

const ReadyBannerWithPreload: React.FC<{ character: CharacterBundle; onClick: () => void }> = ({ character, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const proposalUrls = character.extra?.avatarProposalUrls || [];
  const previewUrls = proposalUrls.slice(0, 2);
  const imagesLoaded = usePreloadedImages(previewUrls);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: imagesLoaded ? 1 : 0, y: imagesLoaded ? 0 : 20, scale: isHovered ? 1.03 : 1 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={!imagesLoaded}
      className="group relative flex items-center gap-3 bg-gradient-to-r from-emerald-900/95 to-green-900/95 backdrop-blur-md border border-emerald-500/50 rounded-full pl-3 pr-5 py-2.5 shadow-lg cursor-pointer overflow-visible disabled:pointer-events-none"
      style={{ boxShadow: imagesLoaded ? `0 0 20px rgba(16, 185, 129, 0.3), 0 0 40px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(255,255,255,0.1)` : "none" }}
    >
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        animate={{
          boxShadow: imagesLoaded
            ? [
                "0 0 15px rgba(16, 185, 129, 0.4), 0 0 30px rgba(16, 185, 129, 0.2)",
                "0 0 25px rgba(16, 185, 129, 0.6), 0 0 50px rgba(16, 185, 129, 0.3)",
                "0 0 15px rgba(16, 185, 129, 0.4), 0 0 30px rgba(16, 185, 129, 0.2)",
              ]
            : "0 0 0 transparent",
        }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />

      {previewUrls.length >= 2 && (
        <div className="relative w-12 h-10 flex-shrink-0">
          <motion.div
            className="absolute w-9 h-9 rounded-lg overflow-hidden border-2 border-white/30 shadow-md"
            style={{ left: 0, top: 0 }}
            animate={{ rotate: isHovered ? -8 : -6, x: isHovered ? -4 : 0, scale: isHovered ? 1.1 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <img src={previewUrls[0]} alt="" className="w-full h-full object-cover" />
          </motion.div>
          <motion.div
            className="absolute w-9 h-9 rounded-lg overflow-hidden border-2 border-white/30 shadow-md"
            style={{ left: 12, top: 2 }}
            animate={{ rotate: isHovered ? 8 : 6, x: isHovered ? 4 : 0, scale: isHovered ? 1.1 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <img src={previewUrls[1]} alt="" className="w-full h-full object-cover" />
          </motion.div>
        </div>
      )}

      <span className="relative text-sm font-medium text-emerald-50">
        Avatar ready for <span className="font-semibold">{character.extra?.displayName || character.name}</span>
      </span>

      <motion.div className="absolute right-2 top-1/2 -translate-y-1/2" animate={{ x: isHovered ? 2 : 0 }} transition={{ type: "spring", stiffness: 400 }}>
        <svg className="w-4 h-4 text-emerald-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </motion.div>
    </motion.button>
  );
};

export const AvatarGenerationBadge: React.FC = () => {
  const { characters } = useBookConvex();
  const [showPicker, setShowPicker] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterBundle | null>(null);
  const { optimisticGenerating, optimisticAvatars, clearOptimisticGeneration, clearOptimisticAvatar, getDisplayName } = useAvatarGenerationStore();

  const serverGenerating = characters.filter((c) => c.extra?.avatarGenerationState === "generating");
  const readyCharacters = characters.filter((c) => c.extra?.avatarGenerationState === "ready" && (c.extra?.avatarProposalUrls?.length ?? 0) > 0);

  const serverGeneratingSlugs = new Set(serverGenerating.map((c) => c.slug.toLowerCase()));
  const serverReadySlugs = new Set(readyCharacters.map((c) => c.slug.toLowerCase()));

  useEffect(() => {
    for (const slug of optimisticGenerating) {
      if (serverGeneratingSlugs.has(slug) || serverReadySlugs.has(slug)) {
        clearOptimisticGeneration(slug);
      }
    }
  }, [serverGeneratingSlugs, serverReadySlugs, optimisticGenerating, clearOptimisticGeneration]);

  useEffect(() => {
    for (const slug of Object.keys(optimisticAvatars)) {
      const character = characters.find((c) => c.slug.toLowerCase() === slug);
      const stateIsComplete = character?.extra?.avatarGenerationState !== "ready";
      if (character?.avatar?.url && stateIsComplete) {
        clearOptimisticAvatar(slug);
      }
    }
  }, [characters, optimisticAvatars, clearOptimisticAvatar]);

  const optimisticOnlyCharacters = Array.from(optimisticGenerating)
    .filter((slug) => !serverGeneratingSlugs.has(slug))
    .map((slug) => ({ slug, displayName: getDisplayName(slug) || slug }));

  const generatingCharacters = [
    ...serverGenerating,
    ...optimisticOnlyCharacters.map((o) => ({ slug: o.slug, name: o.displayName, extra: { displayName: o.displayName } }) as CharacterBundle),
  ];

  const visibleReadyCharacters = readyCharacters.filter((c) => !optimisticAvatars[c.slug.toLowerCase()]);

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
        <AnimatePresence mode="popLayout">
          {generatingCharacters.map((char) => (
            <GeneratingBanner key={`gen-${char.slug.toLowerCase()}`} character={char} />
          ))}
          {visibleReadyCharacters.map((char) => (
            <ReadyBannerWithPreload key={`ready-${char.slug.toLowerCase()}`} character={char} onClick={() => handleReadyClick(char)} />
          ))}
        </AnimatePresence>
      </div>

      {showPicker && selectedCharacter && <AvatarPickerModal character={selectedCharacter} onClose={handleClosePicker} />}
    </>
  );
};
