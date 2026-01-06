/**
 * bookDataStore - Module-level accessor for book data in non-React code
 *
 * Some files in the codebase are plain TypeScript (not React components) and
 * cannot use React hooks. This store provides a simple way for those files
 * to access book data that's managed by BookConvexContext.
 *
 * The store is set once when BookConvexProvider mounts and updates whenever
 * the context value changes.
 *
 * Usage (in non-React code):
 *   import { getBookData } from "@player/state/bookDataStore";
 *   const { charactersData, bookData } = getBookData();
 *
 * For React components, prefer using the useBookConvex() hook directly.
 */

import type {
  BackgroundForBook,
  BackgroundSongSection,
  CharacterData,
  BookData,
  Chapter as ChapterTitle,
} from "@player/types/book";
import type {
  CharacterBundle,
  BackgroundInfo,
  MusicInfo,
  BookMetadata,
  ChapterInfo,
} from "@player/context/BookConvexContext";

// Re-export types for convenience
export type { CharacterBundle, BackgroundInfo, MusicInfo, BookMetadata, ChapterInfo };

// Types for stub data (these will come from CMS later)
export type Note = { id: string; content: string };
export type Variant = { id: string; simplifications: { score: number; sentences: string[] }[] };

export interface BookDataStore {
  // Loading states
  isLoading: boolean;
  isReady: boolean;
  error: string | null;

  // Raw Convex data
  book: BookMetadata | null;
  chapters: ChapterInfo[];
  characters: CharacterBundle[];
  backgrounds: BackgroundInfo[];
  music: MusicInfo[];

  // Processed content (player format)
  bookStringified: string | null;
  chaptersData: ChapterTitle[];
  charactersData: CharacterData[];
  backgroundsForBook: BackgroundForBook[];
  backgroundSongsForBook: BackgroundSongSection[];
  bookData: BookData | null;
  isPlayLayout: boolean;
  knownVideoFiles: string[];

  // Reactivity
  textVersion: number;

  // Stub data (empty arrays for now - will come from CMS later)
  notes: Note[];
  variants: Variant[];
  cutScenes: unknown[];
  audiobookTracks: unknown[];
}

// Module-level store
let _store: BookDataStore | null = null;

// Flag to track if store has ever been set (helps with debugging)
let _storeInitialized = false;

/**
 * Set the book data store. Called by BookConvexProvider when context value changes.
 */
export function setBookDataStore(store: BookDataStore): void {
  _store = store;
  _storeInitialized = true;
}

/**
 * Clear the book data store. Called when provider unmounts.
 */
export function clearBookDataStore(): void {
  _store = null;
}

/**
 * Get the current book data store (all data).
 * Throws if called before BookConvexProvider has mounted.
 *
 * For use in non-React code only. React components should use useBookConvex().
 */
export function getFullStore(): BookDataStore {
  if (!_store) {
    if (!_storeInitialized) {
      throw new Error(
        "[bookDataStore] Store not initialized. " +
          "This usually means a store function was called before BookConvexProvider mounted. " +
          "Ensure your component tree is wrapped in <BookConvexProvider>.",
      );
    }
    throw new Error(
      "[bookDataStore] Store is null but was previously initialized. " +
        "This might mean the provider unmounted unexpectedly.",
    );
  }
  return _store;
}

/**
 * Check if the store is ready (has data and initial load complete).
 * Safe to call anytime - returns false if store isn't initialized.
 */
export function isBookDataReady(): boolean {
  return _store?.isReady ?? false;
}

// =============================================================================
// Convenience accessors for common data
// These mirror the old getter functions for easier migration
// =============================================================================

/**
 * Get book stringified HTML content.
 * Returns null if not ready.
 */
export function getBookStringified(): string | null {
  return _store?.bookStringified ?? null;
}

/**
 * Get character data array.
 * Returns empty array if not ready.
 */
export function getCharactersData(): CharacterData[] {
  return _store?.charactersData ?? [];
}

/**
 * Get book metadata (replaces old getBookData getter).
 * Returns null if not ready.
 */
export function getBookData(): BookData {
  if (!_store) {
    throw new Error(
      "[bookDataStore] Store not initialized. " +
        "This usually means a store function was called before BookConvexProvider mounted. " +
        "Ensure your component tree is wrapped in <BookConvexProvider>.",
    );
  }
  if (!_store.bookData) {
    throw new Error(
      "[bookDataStore] Book data not found. " +
        "This usually means the book data is not loaded yet.",
    );
  }
  return _store.bookData;
}

export function getIsPlayLayout(): boolean {
  return _store?.isPlayLayout ?? false;
}

/**
 * Get backgrounds array.
 * Returns empty array if not ready.
 */
export function getBackgroundsForBook(): BackgroundForBook[] {
  return _store?.backgroundsForBook ?? [];
}

/**
 * Get background songs array.
 * Returns empty array if not ready.
 */
export function getBackgroundSongsForBook(): BackgroundSongSection[] {
  return _store?.backgroundSongsForBook ?? [];
}

/**
 * Get known video files array.
 * Returns empty array if not ready.
 */
export function getKnownVideoFiles(): string[] {
  return _store?.knownVideoFiles ?? [];
}

/**
 * Get notes array (stub - always empty for now).
 */
export function getNotes(): Note[] {
  return _store?.notes ?? [];
}

/**
 * Get variants array (stub - always empty for now).
 */
export function getAllVariants(): Variant[] {
  return _store?.variants ?? [];
}

/**
 * Get cut scenes array (stub - always empty for now).
 */
export function getCutScenesForBook(): unknown[] {
  return _store?.cutScenes ?? [];
}

/**
 * Get audiobook tracks array (stub - always empty for now).
 */
export function getAudiobookTracksForBook(): unknown[] {
  return _store?.audiobookTracks ?? [];
}

/**
 * Get the current book's slug.
 * Returns null if not ready.
 */
export function getBookSlug(): string | null {
  return _store?.bookData?.slug ?? null;
}
