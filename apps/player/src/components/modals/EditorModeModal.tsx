import React, { useState, useMemo, useEffect } from "react";
import ModalUI from "@player/components/modals/ModalUI";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useEditorModeModal } from "@player/stores/modals/editorModeModal.store";
import { useBookConvex } from "@player/context/BookConvexContext";
import { getAvatarSource } from "@player/helpers/svgAvatars";
import { useAvatarGenerationStore } from "@player/stores/avatarGeneration.store";

const capitalizeWords = (str: string): string => {
  return str
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

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
  const { modalType, onSubmit, onCreateCharacter, chapterNumber, paragraphIndex, currentSpeaker, currentCharacterSlug, currentTextContent, selectedText } = useEditorModeModal();
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const { charactersData, characters } = useBookConvex();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCharacterName, setNewCharacterName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<"existing" | "new">("existing");
  const [searchQuery, setSearchQuery] = useState("");

  const currentCharacterForSort = modalType === "edit-character-tag" ? currentCharacterSlug : currentSpeaker;

  const { optimisticAvatars } = useAvatarGenerationStore();

  const sortedCharacters = useMemo<CharacterWithStats[]>(() => {
    const withStats = charactersData.map((charData) => {
      const bundle = characters.find((c) => c.slug.toLowerCase() === charData.slug.toLowerCase());
      const talkingCount = charData.infoPerChapter.reduce((sum, info) => sum + (info.paragraphsWhereTalking?.length || 0), 0);
      const isCurrentSpeaker = currentCharacterForSort?.toLowerCase() === charData.slug.toLowerCase();
      const optimisticAvatar = optimisticAvatars[charData.slug.toLowerCase()];

      return { slug: charData.slug, name: charData.characterName, avatarUrl: optimisticAvatar || bundle?.avatar?.url, talkingCount, isCurrentSpeaker };
    });

    return withStats.sort((a, b) => {
      if (a.isCurrentSpeaker && !b.isCurrentSpeaker) return -1;
      if (!a.isCurrentSpeaker && b.isCurrentSpeaker) return 1;
      return b.talkingCount - a.talkingCount;
    });
  }, [charactersData, characters, currentCharacterForSort, optimisticAvatars]);

  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return sortedCharacters;
    const query = searchQuery.toLowerCase();
    return sortedCharacters.filter((c) => c.name.toLowerCase().includes(query) || c.slug.toLowerCase().includes(query));
  }, [sortedCharacters, searchQuery]);

  useEffect(() => {
    if (currentSpeaker && modalType === "set-talking-character") {
      const matchingChar = sortedCharacters.find((c) => c.slug.toLowerCase() === currentSpeaker.toLowerCase());
      setSelectedCharacter(matchingChar?.slug || currentSpeaker);
    }
    if (currentCharacterSlug && modalType === "edit-character-tag") {
      const matchingChar = sortedCharacters.find((c) => c.slug.toLowerCase() === currentCharacterSlug.toLowerCase());
      setSelectedCharacter(matchingChar?.slug || currentCharacterSlug);
    }
  }, [currentSpeaker, currentCharacterSlug, modalType, sortedCharacters]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      await onSubmit(selectedCharacter || "");
      onClose();
    }
  };

  const handleSetSpeaker = () => {
    if (!selectedCharacter) {
      setError("Please select a character first");
      return;
    }
    onSubmit?.(selectedCharacter);
    onClose();
  };

  const handleRemoveSpeaker = () => {
    onSubmit?.(undefined);
    onClose();
  };

  const handleCharacterClick = (slug: string) => {
    setSelectedCharacter(slug);
    setError("");
  };

  const handleCreateAndUse = async () => {
    const trimmedName = capitalizeWords(newCharacterName);
    if (!trimmedName) {
      setError("Please enter a character name");
      return;
    }
    if (!onCreateCharacter || chapterNumber === null || paragraphIndex === null) {
      setError("Cannot create character");
      return;
    }

    setIsCreating(true);
    setError("");

    try {
      const { slug, displayName } = await onCreateCharacter(trimmedName, chapterNumber, paragraphIndex);

      useAvatarGenerationStore.getState().startOptimisticGeneration(slug, displayName);

      onSubmit?.(slug);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create character";
      setError(message);
      setIsCreating(false);
    }
  };

  const generateNewCharacterAvatar = (name: string) => {
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "new";
    return getAvatarSource({ slug, characterName: name, bookSlug: "", infoPerChapter: [] });
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

            {onCreateCharacter && (
              <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg">
                <button
                  onClick={() => {
                    setActiveTab("existing");
                    setNewCharacterName("");
                    setError("");
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "existing" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Existing
                </button>
                <button
                  onClick={() => {
                    setActiveTab("new");
                    setSelectedCharacter(null);
                    setNewCharacterName(capitalizeWords(searchQuery));
                    setSearchQuery("");
                    setError("");
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "new" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  New
                </button>
              </div>
            )}

            {activeTab === "existing" ? (
              <>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search characters..."
                  autoFocus
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />

                <div className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    {filteredCharacters.length === 0 ? (
                      <div className="p-4 text-center text-zinc-500">No characters found</div>
                    ) : (
                      filteredCharacters.map((character) => {
                        const isSelected = selectedCharacter === character.slug;
                        return (
                          <div
                            key={character.slug}
                            onClick={() => handleCharacterClick(character.slug)}
                            className={`flex items-center gap-4 p-3 cursor-pointer transition-colors ${
                              isSelected ? "bg-purple-600/30 border-l-4 border-l-purple-500" : "border-l-4 border-l-transparent hover:bg-zinc-800"
                            } ${character.isCurrentSpeaker && !isSelected ? "bg-zinc-800/50" : ""}`}
                          >
                            {character.avatarUrl ? (
                              <img src={character.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-lg text-zinc-400 flex-shrink-0">
                                {character.name.charAt(0)}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-white truncate">{character.name}</div>
                              <div className="text-xs text-zinc-500">{character.talkingCount > 0 ? `${character.talkingCount} speaking lines` : "No speaking lines yet"}</div>
                            </div>
                            {character.isCurrentSpeaker && <div className="text-xs text-purple-400 bg-purple-500/20 px-2 py-1 rounded">Current</div>}
                            {isSelected && !character.isCurrentSpeaker && <div className="w-3 h-3 rounded-full bg-purple-500" />}
                          </div>
                        );
                      })
                    )}
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
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  {newCharacterName.trim() ? (
                    <img src={generateNewCharacterAvatar(newCharacterName)} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-2xl text-zinc-400 flex-shrink-0">+</div>
                  )}
                  <input
                    type="text"
                    value={newCharacterName}
                    onChange={(e) => {
                      setNewCharacterName(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCharacterName.trim()) {
                        handleCreateAndUse();
                      }
                    }}
                    placeholder="Character name..."
                    autoFocus
                    disabled={isCreating}
                    className="flex-1 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={isCreating}
                    className="flex-1 bg-zinc-700 text-white hover:bg-zinc-600 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateAndUse}
                    disabled={isCreating || !newCharacterName.trim()}
                    className="flex-1 bg-green-600 text-white hover:bg-green-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isCreating ? "Creating..." : "Create & Use"}
                  </button>
                </div>
              </>
            )}

            {currentSpeaker && (
              <button
                onClick={handleRemoveSpeaker}
                disabled={isSubmitting || isCreating}
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

      case "edit-character-tag":
        return (
          <div className="flex flex-col gap-4">
            <div className="text-sm text-zinc-400 text-center">
              Chapter {chapterNumber}, Paragraph {paragraphIndex}
            </div>

            <div className="bg-zinc-800 rounded-lg p-3 text-center">
              <div className="text-xs text-zinc-500 mb-1">Text wrapped with character:</div>
              <div className="text-white font-medium">"{currentTextContent}"</div>
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            {onCreateCharacter && (
              <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg">
                <button
                  onClick={() => {
                    setActiveTab("existing");
                    setNewCharacterName("");
                    setError("");
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "existing" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Existing
                </button>
                <button
                  onClick={() => {
                    setActiveTab("new");
                    setSelectedCharacter(null);
                    setNewCharacterName(capitalizeWords(searchQuery));
                    setSearchQuery("");
                    setError("");
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "new" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  New
                </button>
              </div>
            )}

            {activeTab === "existing" ? (
              <>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search characters..."
                  autoFocus
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />

                <div className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    {filteredCharacters.length === 0 ? (
                      <div className="p-4 text-center text-zinc-500">No characters found</div>
                    ) : (
                      filteredCharacters.map((character) => {
                        const isSelected = selectedCharacter === character.slug;
                        return (
                          <div
                            key={character.slug}
                            onClick={() => handleCharacterClick(character.slug)}
                            className={`flex items-center gap-4 p-3 cursor-pointer transition-colors ${
                              isSelected ? "bg-purple-600/30 border-l-4 border-l-purple-500" : "border-l-4 border-l-transparent hover:bg-zinc-800"
                            } ${character.isCurrentSpeaker && !isSelected ? "bg-zinc-800/50" : ""}`}
                          >
                            {character.avatarUrl ? (
                              <img src={character.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-lg text-zinc-400 flex-shrink-0">
                                {character.name.charAt(0)}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-white truncate">{character.name}</div>
                              <div className="text-xs text-zinc-500">{character.talkingCount > 0 ? `${character.talkingCount} speaking lines` : "No speaking lines yet"}</div>
                            </div>
                            {character.isCurrentSpeaker && <div className="text-xs text-purple-400 bg-purple-500/20 px-2 py-1 rounded">Current</div>}
                            {isSelected && !character.isCurrentSpeaker && <div className="w-3 h-3 rounded-full bg-purple-500" />}
                          </div>
                        );
                      })
                    )}
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
                    disabled={isSubmitting || !selectedCharacter || selectedCharacter === currentCharacterSlug}
                    className="flex-1 bg-purple-600 text-white hover:bg-purple-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSubmitting ? "Saving..." : "Change Character"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  {newCharacterName.trim() ? (
                    <img src={generateNewCharacterAvatar(newCharacterName)} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-2xl text-zinc-400 flex-shrink-0">+</div>
                  )}
                  <input
                    type="text"
                    value={newCharacterName}
                    onChange={(e) => {
                      setNewCharacterName(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCharacterName.trim()) {
                        handleCreateAndUse();
                      }
                    }}
                    placeholder="Character name..."
                    autoFocus
                    disabled={isCreating}
                    className="flex-1 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={isCreating}
                    className="flex-1 bg-zinc-700 text-white hover:bg-zinc-600 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateAndUse}
                    disabled={isCreating || !newCharacterName.trim()}
                    className="flex-1 bg-green-600 text-white hover:bg-green-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isCreating ? "Creating..." : "Create & Use"}
                  </button>
                </div>
              </>
            )}

            <button
              onClick={handleRemoveSpeaker}
              disabled={isSubmitting || isCreating}
              className="w-full bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? "Removing..." : "Remove Character Tag"}
            </button>
          </div>
        );

      case "wrap-with-character":
        return (
          <div className="flex flex-col gap-4">
            <div className="text-sm text-zinc-400 text-center">
              Chapter {chapterNumber}, Paragraph {paragraphIndex}
            </div>

            <div className="bg-zinc-800 rounded-lg p-3 text-center">
              <div className="text-xs text-zinc-500 mb-1">Selected text to wrap:</div>
              <div className="text-white font-medium">"{selectedText}"</div>
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            {onCreateCharacter && (
              <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg">
                <button
                  onClick={() => {
                    setActiveTab("existing");
                    setNewCharacterName("");
                    setError("");
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "existing" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Existing
                </button>
                <button
                  onClick={() => {
                    setActiveTab("new");
                    setSelectedCharacter(null);
                    setNewCharacterName(capitalizeWords(searchQuery));
                    setSearchQuery("");
                    setError("");
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "new" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  New
                </button>
              </div>
            )}

            {activeTab === "existing" ? (
              <>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search characters..."
                  autoFocus
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />

                <div className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    {filteredCharacters.length === 0 ? (
                      <div className="p-4 text-center text-zinc-500">No characters found</div>
                    ) : (
                      filteredCharacters.map((character) => {
                        const isSelected = selectedCharacter === character.slug;
                        return (
                          <div
                            key={character.slug}
                            onClick={() => handleCharacterClick(character.slug)}
                            className={`flex items-center gap-4 p-3 cursor-pointer transition-colors ${
                              isSelected ? "bg-purple-600/30 border-l-4 border-l-purple-500" : "border-l-4 border-l-transparent hover:bg-zinc-800"
                            }`}
                          >
                            {character.avatarUrl ? (
                              <img src={character.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-lg text-zinc-400 flex-shrink-0">
                                {character.name.charAt(0)}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-white truncate">{character.name}</div>
                              <div className="text-xs text-zinc-500">{character.talkingCount > 0 ? `${character.talkingCount} speaking lines` : "No speaking lines yet"}</div>
                            </div>
                            {isSelected && <div className="w-3 h-3 rounded-full bg-purple-500" />}
                          </div>
                        );
                      })
                    )}
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
                    {isSubmitting ? "Wrapping..." : "Wrap with Character"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  {newCharacterName.trim() ? (
                    <img src={generateNewCharacterAvatar(newCharacterName)} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-2xl text-zinc-400 flex-shrink-0">+</div>
                  )}
                  <input
                    type="text"
                    value={newCharacterName}
                    onChange={(e) => {
                      setNewCharacterName(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCharacterName.trim()) {
                        handleCreateAndUse();
                      }
                    }}
                    placeholder="Character name..."
                    autoFocus
                    disabled={isCreating}
                    className="flex-1 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={isCreating}
                    className="flex-1 bg-zinc-700 text-white hover:bg-zinc-600 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateAndUse}
                    disabled={isCreating || !newCharacterName.trim()}
                    className="flex-1 bg-green-600 text-white hover:bg-green-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isCreating ? "Creating..." : "Create & Use"}
                  </button>
                </div>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const getTitle = () => {
    if (modalType === "set-talking-character") {
      return "Set Speaking Character";
    }
    if (modalType === "edit-character-tag") {
      return "Edit Character Tag";
    }
    if (modalType === "wrap-with-character") {
      return "Wrap Text with Character";
    }
    return "Editor Mode";
  };

  const getWidth = () => {
    if (modalType === "set-talking-character" || modalType === "edit-character-tag" || modalType === "wrap-with-character") {
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
