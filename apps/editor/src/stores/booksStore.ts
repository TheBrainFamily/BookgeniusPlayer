import {create} from "zustand";
import {getCurrentChapterFromUrl} from "../utils/getCurrentChapterFromUrl.ts";
import {getCurrentBookFromUrl} from "../utils/getCurrentBookFromUrl.ts";
import type {Character} from "../utils/characterTagging.ts";
import type {Variant} from "../types.ts";

interface BookState {
  books: string[];
  currentBook: string;
  chapters: Record<string, string>;
  currentFile: string;
  metadata: Record<string, string>;
  currentChapterContent: string;
  characters: Character[];
  variants: Variant[];

  setBooks(books: string[]): void;
  setCurrentBook(book: string): void;
  setChapters(chapters: Record<string, string>): void;
  setCurrentFile(currentFile: string): void;
  setMetadata(metadata: Record<string, string>): void;
  setCurrentChapterContent(currentChapterContent: string): void;
  setCharacters(characters: Character[]): void;
  setVariants(variants: Variant[]): void;
}

export const useBooksStore = create<BookState>((set) => ({
  books: [],
  currentBook: getCurrentBookFromUrl(),
  chapters: {},
  currentFile: getCurrentChapterFromUrl(),
  metadata: {},
  currentChapterContent: '',
  characters: [],
  variants: [],
  setBooks: (books: string[]) => set({books}),
  setCurrentBook: (book: string) => set({currentBook: book}),
  setChapters: (chapters: Record<string, string>) => set({chapters}),
  setCurrentFile: (currentFile: string) => set({currentFile}),
  setMetadata: (metadata: Record<string, string>) => set({metadata}),
  setCurrentChapterContent: (currentChapterContent: string) => set({currentChapterContent}),
  setCharacters: (characters: Character[]) => set({characters}),
  setVariants: (variants: Variant[]) => set({variants}),
}))
