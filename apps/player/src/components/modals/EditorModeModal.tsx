import React, { useState, useMemo, useEffect } from "react";
import ModalUI from "@player/components/modals/ModalUI";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useEditorModeModal } from "@player/stores/modals/editorModeModal.store";
import { useBookConvex } from "@player/context/BookConvexContext";

interface EditorModeModalProps {
  onClose: () => void;
}

interface CharacterWithStats {
  slug: string;
  name: string;
  avatarUrl?: string;
  talkingCount: number;
  isCurrentSpeaker: boolean;
}

const EditorModeModal: React.FC<EditorModeModalProps> = ({ onClose }) => {
  const { modalType, onSubmit, chapterNumber, paragraphIndex, currentSpeaker } = useEditorModeModal();
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const { charactersData, characters } = useBookConvex();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sortedCharacters = useMemo<CharacterWithStats[]>(() => {
    const withStats = charactersData.map((charData) => {
      const bundle = characters.find((c) => c.slug.toLowerCase() === charData.slug.toLowerCase());
      const talkingCount = charData.infoPerChapter.reduce((sum, info) => sum + (info.paragraphsWhereTalking?.length || 0), 0);
      const isCurrentSpeaker = currentSpeaker?.toLowerCase() === charData.slug.toLowerCase();

      return { slug: charData.slug, name: charData.characterName, avatarUrl: bundle?.avatar?.url, talkingCount, isCurrentSpeaker };
    });

    return withStats.sort((a, b) => {
      if (a.isCurrentSpeaker && !b.isCurrentSpeaker) return -1;
      if (!a.isCurrentSpeaker && b.isCurrentSpeaker) return 1;
      return b.talkingCount - a.talkingCount;
    });
  }, [charactersData, characters, currentSpeaker]);

  useEffect(() => {
    if (currentSpeaker && modalType === "set-talking-character") {
      setSelectedCharacter(currentSpeaker);
    }
  }, [currentSpeaker, modalType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      await onSubmit(selectedCharacter || "");
      onClose();
    }
  };

  const handleSetSpeaker = async () => {
    if (!selectedCharacter) {
      setError("Please select a character first");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      if (onSubmit) {
        await onSubmit(selectedCharacter);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set speaker");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveSpeaker = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      if (onSubmit) {
        await onSubmit(undefined);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove speaker");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCharacterClick = (slug: string) => {
    setSelectedCharacter(slug);
    setError("");
  };

  const renderContent = () => {
    if (!modalType) return null;

    switch (modalType) {
      case "set-talking-character":
        return (
          <div className="flex flex-col gap-4">
            <div className="text-sm text-zinc-400 text-center">
              Chapter {chapterNumber}, Paragraph {paragraphIndex}
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <div className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden">
              <div className="max-h-80 overflow-y-auto">
                {sortedCharacters.map((character) => {
                  const isSelected = selectedCharacter === character.slug;
                  return (
                    <div
                      key={character.slug}
                      onClick={() => handleCharacterClick(character.slug)}
                      className={`
                        flex items-center gap-4 p-3 cursor-pointer transition-colors
                        ${isSelected ? "bg-purple-600/30 border-l-4 border-l-purple-500" : "border-l-4 border-l-transparent hover:bg-zinc-800"}
                        ${character.isCurrentSpeaker && !isSelected ? "bg-zinc-800/50" : ""}
                      `}
                    >
                      {character.avatarUrl ? (
                        <img src={character.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-lg text-zinc-400 flex-shrink-0">{character.name.charAt(0)}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">{character.name}</div>
                        <div className="text-xs text-zinc-500">{character.talkingCount > 0 ? `${character.talkingCount} speaking lines` : "No speaking lines yet"}</div>
                      </div>
                      {character.isCurrentSpeaker && <div className="text-xs text-purple-400 bg-purple-500/20 px-2 py-1 rounded">Current</div>}
                      {isSelected && !character.isCurrentSpeaker && <div className="w-3 h-3 rounded-full bg-purple-500" />}
                    </div>
                  );
                })}
              </div>
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
                onClick={handleSetSpeaker}
                disabled={isSubmitting || !selectedCharacter}
                className="flex-1 bg-purple-600 text-white hover:bg-purple-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "Saving..." : "Set Speaker"}
              </button>
            </div>

            {currentSpeaker && (
              <button
                onClick={handleRemoveSpeaker}
                disabled={isSubmitting}
                className="w-full bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Removing..." : "Remove Current Speaker"}
              </button>
            )}
          </div>
        );

      case "edit-paragraph":
        return (
          <div className="space-y-4">
            <p className="text-center">Are you sure you want to edit this paragraph?</p>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90 h-10 px-4 py-2 rounded-md cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSubmit} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md cursor-pointer">
                Edit
              </button>
            </div>
          </div>
        );

      case "remove-character":
        return (
          <div className="space-y-4">
            <p className="text-center">Are you sure you want to remove this character?</p>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90 h-10 px-4 py-2 rounded-md cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSubmit} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md cursor-pointer">
                Remove
              </button>
            </div>
          </div>
        );

      case "add-character":
        return (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selectedCharacter) {
                setError("Please select a character first");
                return;
              }
              await handleSubmit(e);
            }}
            className="space-y-4"
          >
            {error && <p className="text-destructive text-sm text-center">{error}</p>}
            <div>
              <Select onValueChange={(v) => setSelectedCharacter(v)} value={selectedCharacter || ""}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Wybierz postać" />
                </SelectTrigger>
                <SelectContent className="max-h-60 bg-zinc-900 border-zinc-700">
                  {sortedCharacters.map((character) => (
                    <SelectItem key={character.slug} value={character.slug} className="py-2">
                      <div className="flex items-center gap-2">
                        {character.avatarUrl ? (
                          <img src={character.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-400">{character.name.charAt(0)}</div>
                        )}
                        <span>{character.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md cursor-pointer">
              Add Character
            </button>
          </form>
        );

      default:
        return null;
    }
  };

  const getTitle = () => {
    if (modalType === "set-talking-character") {
      return "Set Speaking Character";
    }
    return "Editor Mode";
  };

  const getWidth = () => {
    if (modalType === "set-talking-character") {
      return "w-96";
    }
    return "w-80";
  };

  return (
    <ModalUI title={getTitle()} onClose={onClose}>
      <div className={getWidth()}>{renderContent()}</div>
    </ModalUI>
  );
};

export default EditorModeModal;
