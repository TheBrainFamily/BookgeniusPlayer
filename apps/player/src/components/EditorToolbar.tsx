import React from "react";
import { Image, Music, Edit, Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { useEditMode } from "@player/context/EditModeContext";
import { useCurrentMediaCues } from "@player/hooks/useCurrentMediaCues";
import { useBackgroundEditModal } from "@player/stores/modals/backgroundEditModal.store";
import { useBackgroundAddModal } from "@player/stores/modals/backgroundAddModal.store";
import { useMusicEditModal } from "@player/stores/modals/musicEditModal.store";
import { useMusicAddModal } from "@player/stores/modals/musicAddModal.store";

function formatRange(
  startChapter: number,
  startParagraph: number,
  endChapter: number,
  endParagraph: number,
): string {
  if (endChapter === 999) {
    return `Ch ${startChapter} ¶${startParagraph} → end`;
  }
  if (startChapter === endChapter) {
    return `Ch ${startChapter} ${startParagraph}–${endParagraph}`;
  }
  return `Ch ${startChapter} ${startParagraph} → Ch ${endChapter} ${endParagraph}`;
}

export const EditorToolbar: React.FC = () => {
  const { isEditModeActive } = useEditMode();
  const { currentBackground, currentMusic, currentChapter, currentParagraph } =
    useCurrentMediaCues();

  const { openModal: openBackgroundEdit } = useBackgroundEditModal();
  const { openModal: openBackgroundAdd } = useBackgroundAddModal();
  const { openModal: openMusicEdit } = useMusicEditModal();
  const { openModal: openMusicAdd } = useMusicAddModal();

  const handleEditBackground = () => {
    if (!currentBackground) return;
    openBackgroundEdit({
      cueId: currentBackground.cueId,
      fileBasename: currentBackground.fileBasename,
      chapter: currentBackground.startChapter,
      paragraph: currentBackground.startParagraph,
      currentBackgroundUrl: currentBackground.url,
      backgroundColor: currentBackground.backgroundColor,
      textColor: currentBackground.textColor,
    });
  };

  const handleAddBackground = () => {
    openBackgroundAdd({ chapter: currentChapter, paragraph: currentParagraph });
  };

  const handleEditMusic = () => {
    if (!currentMusic) return;
    openMusicEdit({
      cueId: currentMusic.cueId,
      fileBasename: currentMusic.fileBasename,
      chapter: currentMusic.chapter,
      paragraph: currentMusic.paragraph,
      currentMusicUrl: currentMusic.url,
      title: currentMusic.title,
      artist: currentMusic.artist,
      coverUrl: currentMusic.coverUrl,
    });
  };

  const handleAddMusic = () => {
    openMusicAdd({ chapter: currentChapter, paragraph: currentParagraph });
  };

  return (
    <AnimatePresence>
      {isEditModeActive && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.15 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl px-4 py-3 flex gap-6"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-zinc-400">
              <Image size={16} />
              <span className="text-xs font-medium">Background</span>
            </div>
            {currentBackground ? (
              <div className="flex items-center gap-2">
                {currentBackground.previewUrl && (
                  <img
                    src={currentBackground.previewUrl}
                    alt=""
                    className="w-8 h-8 rounded object-cover"
                  />
                )}
                <div className="flex flex-col">
                  <span className="text-white text-sm font-medium truncate max-w-[120px]">
                    {currentBackground.fileBasename}
                  </span>
                  <span className="text-zinc-500 text-xs">
                    {formatRange(
                      currentBackground.startChapter,
                      currentBackground.startParagraph,
                      currentBackground.endChapter,
                      currentBackground.endParagraph,
                    )}
                  </span>
                </div>
                <button
                  onClick={handleEditBackground}
                  className="p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
                  title="Edit background"
                >
                  <Edit size={14} />
                </button>
              </div>
            ) : (
              <span className="text-zinc-500 text-sm">None</span>
            )}
            <button
              onClick={handleAddBackground}
              className="p-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
              title="Add background here"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="w-px bg-white/20" />

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-zinc-400">
              <Music size={16} />
              <span className="text-xs font-medium">Music</span>
            </div>
            {currentMusic ? (
              <div className="flex items-center gap-2">
                {currentMusic.coverUrl && (
                  <img
                    src={currentMusic.coverUrl}
                    alt=""
                    className="w-8 h-8 rounded object-cover"
                  />
                )}
                <div className="flex flex-col">
                  <span className="text-white text-sm font-medium truncate max-w-[120px]">
                    {currentMusic.title || currentMusic.fileBasename}
                  </span>
                  <span className="text-zinc-500 text-xs">
                    {formatRange(
                      currentMusic.chapter,
                      currentMusic.paragraph,
                      currentMusic.endChapter,
                      currentMusic.endParagraph,
                    )}
                  </span>
                </div>
                <button
                  onClick={handleEditMusic}
                  className="p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
                  title="Edit music"
                >
                  <Edit size={14} />
                </button>
              </div>
            ) : (
              <span className="text-zinc-500 text-sm">None</span>
            )}
            <button
              onClick={handleAddMusic}
              className="p-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
              title="Add music here"
            >
              <Plus size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
