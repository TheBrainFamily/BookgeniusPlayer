"use client";

/**
 * CharacterGrid - Grid of character bundles for a book
 *
 * Replaces the flat asset list view when viewing a book's characters folder.
 * Shows characters as cards with their avatar and bundle status.
 *
 * This component is Convex-free - it uses the BookProvider context.
 */

import { useCharacters, useBook } from "@/lib/contexts";
import { CharacterBundleView, CharacterBundleViewSkeleton } from "./CharacterBundleView";
import { CreateCharacterDialog } from "../dialogs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useCallback } from "react";

interface CharacterGridProps {
  onCharacterSelect: (characterPath: string) => void;
  onCreateCharacter?: () => void; // Kept for backwards compatibility
}

export function CharacterGrid({ onCharacterSelect, onCreateCharacter }: CharacterGridProps) {
  const { characters, isLoading } = useCharacters();
  const { bookPath } = useBook();
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Handle create button click
  const handleCreateClick = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  // Handle character created
  const handleCharacterCreated = useCallback(
    (characterPath: string) => {
      onCharacterSelect(characterPath);
    },
    [onCharacterSelect],
  );

  // Filter characters by search
  const filteredCharacters = useMemo(() => {
    if (!characters) return [];
    if (!searchQuery) return characters;
    const query = searchQuery.toLowerCase();
    return characters.filter((c) => c.name.toLowerCase().includes(query) || c.slug.toLowerCase().includes(query));
  }, [characters, searchQuery]);

  if (isLoading) {
    return <CharacterGridSkeleton />;
  }

  if (!characters || characters.length === 0) {
    return (
      <>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="font-medium text-foreground">No characters yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Create a character folder with avatar, speaks, and listens assets</p>
          </div>
          <Button onClick={handleCreateClick}>
            <Plus className="h-4 w-4 mr-2" />
            Create Character
          </Button>
        </div>

        {/* Create Character Dialog */}
        <CreateCharacterDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} bookPath={bookPath} onCreated={handleCharacterCreated} />
      </>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Characters</span>
            <Badge variant="secondary">{characters.length}</Badge>
          </div>
          <Button size="sm" onClick={handleCreateClick}>
            <Plus className="h-4 w-4 mr-2" />
            Add Character
          </Button>
        </div>

        {/* Search */}
        {characters.length > 6 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search characters..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-9" />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1">
        {filteredCharacters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Search className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">No matches found</p>
              <p className="text-sm text-muted-foreground">Try a different search term</p>
            </div>
            <Button variant="outline" onClick={() => setSearchQuery("")}>
              Clear Search
            </Button>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredCharacters.map((character) => (
              <CharacterBundleView key={character.path} characterPath={character.path} onClick={() => onCharacterSelect(character.path)} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Create Character Dialog */}
      <CreateCharacterDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} bookPath={bookPath} onCreated={handleCharacterCreated} />
    </div>
  );
}

export function CharacterGridSkeleton() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header skeleton */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-muted animate-pulse" />
            <div className="h-5 w-24 rounded bg-muted animate-pulse" />
            <div className="h-5 w-8 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-8 w-32 rounded bg-muted animate-pulse" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="flex-1 p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(8)].map((_, i) => (
            <CharacterBundleViewSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
