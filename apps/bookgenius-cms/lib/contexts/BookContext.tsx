"use client";

/**
 * BookContext - Data layer abstraction for book operations
 *
 * This context hides Convex-specific details from UI components.
 * Components use clean hooks like `useBook()`, `useCharacters()`, etc.
 * All Convex queries are contained here - components are Convex-free.
 *
 * Benefits:
 * - Components don't import from convex/react
 * - Easy to test (mock the hooks)
 * - Could swap backend without touching components
 * - Granular reactivity (each query triggers its own re-render)
 */

import { createContext, useContext, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { BookFolderExtra, CharacterFolderExtra } from "../types/book";

// =============================================================================
// Types
// =============================================================================

interface BookMetadata {
  path: string;
  slug: string;
  name: string;
  extra: BookFolderExtra | unknown;
  createdAt: number;
  updatedAt: number;
}

interface CharacterSummary {
  path: string;
  slug: string;
  name: string;
  extra: CharacterFolderExtra | unknown;
  createdAt: number;
  updatedAt: number;
}

interface ChapterSummary {
  path: string;
  basename: string;
  url: string;
  versionId: string;
  contentType?: string;
  size?: number;
  publishedAt?: number;
  chapterNumber: number;
  title?: string;
  extra: unknown;
}

interface BookStats {
  characterCount: number;
  chapterCount: number;
  backgroundCount: number;
  musicCount: number;
}

interface BookContextValue {
  bookPath: string;
  metadata: BookMetadata | null | undefined;
  characters: CharacterSummary[] | undefined;
  chapters: ChapterSummary[] | undefined;
  stats: BookStats | undefined;
  isLoading: boolean;
}

// =============================================================================
// Context
// =============================================================================

const BookContext = createContext<BookContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface BookProviderProps {
  bookPath: string;
  children: ReactNode;
}

export function BookProvider({ bookPath, children }: BookProviderProps) {
  // Queries for book data - each component subscribes independently
  const { data: metadata, isLoading: metadataLoading } = useQuery(convexQuery(api.bookQueries.getBookMetadata, { bookPath }));

  const { data: characters, isLoading: charactersLoading } = useQuery(convexQuery(api.bookQueries.listCharacters, { bookPath }));

  const { data: chapters, isLoading: chaptersLoading } = useQuery(convexQuery(api.bookQueries.listChapters, { bookPath }));

  const { data: stats, isLoading: statsLoading } = useQuery(convexQuery(api.bookQueries.getBookStats, { bookPath }));

  const isLoading = metadataLoading || charactersLoading || chaptersLoading || statsLoading;

  const value = useMemo<BookContextValue>(
    () => ({
      bookPath,
      metadata: metadata as BookMetadata | null | undefined,
      characters: characters as CharacterSummary[] | undefined,
      chapters: chapters as ChapterSummary[] | undefined,
      stats: stats as BookStats | undefined,
      isLoading,
    }),
    [bookPath, metadata, characters, chapters, stats, isLoading],
  );

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Get the full book context.
 * Must be used within a BookProvider.
 */
export function useBook() {
  const context = useContext(BookContext);
  if (!context) {
    throw new Error("useBook must be used within a BookProvider");
  }
  return context;
}

/**
 * Get book metadata only.
 */
export function useBookMetadata() {
  const { metadata, isLoading } = useBook();
  return { metadata, isLoading };
}

/**
 * Get character list for the current book.
 */
export function useCharacters() {
  const { characters, isLoading } = useBook();
  return { characters, isLoading };
}

/**
 * Get chapter list for the current book.
 */
export function useChapters() {
  const { chapters, isLoading } = useBook();
  return { chapters, isLoading };
}

/**
 * Get book stats.
 */
export function useBookStats() {
  const { stats, isLoading } = useBook();
  return { stats, isLoading };
}

// =============================================================================
// Standalone hook (doesn't require BookProvider)
// =============================================================================

/**
 * Get the list of all books.
 * This is a standalone hook that doesn't require BookProvider.
 */
export function useBooks() {
  const { data: books, isLoading } = useQuery(convexQuery(api.bookQueries.listBooks, {}));

  return { books, isLoading };
}
