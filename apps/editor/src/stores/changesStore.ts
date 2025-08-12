import { create } from "zustand";
import type { Variant } from "../types.ts";

export interface FileChange {
  filePath: string;
  bookName: string;
  bookTitle: string;
  originalContent: string | Variant; // String for chapters, ParsedVariant for variants
  currentContent: string | Variant; // String for chapters, ParsedVariant for variants
  timestamp: number;
  type: "chapter" | "variant";
}

interface ChangesState {
  // Track changes per book
  bookChanges: Record<string, FileChange[]>;

  // Current changes for the active book
  getCurrentBookChanges: (bookName: string) => FileChange[];

  // Track a file change
  trackChange: (bookName: string, bookTitle: string, filePath: string, originalContent: string | Variant, currentContent: string | Variant, type: "chapter" | "variant") => void;

  // Remove a file change (when saved)
  removeChange: (bookName: string, filePath: string) => void;

  // Clear all changes for a book
  clearBookChanges: (bookName: string) => void;

  // Get total unsaved changes count for a book
  getUnsavedCount: (bookName: string) => number;

  // Check if there are unsaved changes for a book
  hasUnsavedChanges: (bookName: string) => boolean;

  // Get all changes across all books
  getAllChanges: () => FileChange[];

  // Get changes grouped by book
  getAllChangesGroupedByBook: () => Record<string, FileChange[]>;

  // Clear all changes across all books
  clearAllChanges: () => void;
}

export const useChangesStore = create<ChangesState>((set, get) => ({
  bookChanges: {},

  getCurrentBookChanges: (bookName: string) => {
    return get().bookChanges[bookName] || [];
  },

  trackChange: (bookName: string, bookTitle: string, filePath: string, originalContent: string | Variant, currentContent: string | Variant, type: "chapter" | "variant") => {
    set((state) => {
      const bookChanges = { ...state.bookChanges };
      if (!bookChanges[bookName]) {
        bookChanges[bookName] = [];
      }

      // Remove existing change for this file if it exists
      bookChanges[bookName] = bookChanges[bookName].filter((change) => change.filePath !== filePath);

      // Only add if there are actual changes
      if (originalContent !== currentContent) {
        bookChanges[bookName].push({ filePath, bookName, bookTitle, originalContent, currentContent, timestamp: Date.now(), type });
      }

      return { bookChanges };
    });
  },

  removeChange: (bookName: string, filePath: string) => {
    set((state) => {
      const bookChanges = { ...state.bookChanges };
      if (bookChanges[bookName]) {
        bookChanges[bookName] = bookChanges[bookName].filter((change) => change.filePath !== filePath);
        if (bookChanges[bookName].length === 0) {
          delete bookChanges[bookName];
        }
      }
      return { bookChanges };
    });
  },

  clearBookChanges: (bookName: string) => {
    set((state) => {
      const bookChanges = { ...state.bookChanges };
      delete bookChanges[bookName];
      return { bookChanges };
    });
  },

  getUnsavedCount: (bookName: string) => {
    const changes = get().bookChanges[bookName];
    return changes ? changes.length : 0;
  },

  hasUnsavedChanges: (bookName: string) => {
    return get().getUnsavedCount(bookName) > 0;
  },

  getAllChanges: () => {
    const bookChanges = get().bookChanges;
    const allChanges: FileChange[] = [];

    Object.values(bookChanges).forEach((changes) => {
      allChanges.push(...changes);
    });

    return allChanges.sort((a, b) => b.timestamp - a.timestamp);
  },

  getAllChangesGroupedByBook: () => {
    return get().bookChanges;
  },

  clearAllChanges: () => {
    set({ bookChanges: {} });
  },
}));
