// Service to dynamically load book data at runtime
import type { BookData, BackgroundForBook, BackgroundSongSection, CutSceneForBook, CharacterData, AudiobookTracksSection, QuizOutput } from "@/types/book";
import type { Variant } from "@/genericBookDataGetters/getAllVariants";
import { getBookDataUrl } from "@/utils/assetUrls";

async function importPublicModule(moduleUrl) {
  try {
    const response = await fetch(moduleUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${moduleUrl}: ${response.statusText}`);
    }
    const text = await response.text();
    const dataUrl = `data:application/javascript;charset=utf-8,${encodeURIComponent(text)}`;
    return await import(dataUrl);
  } catch (error) {
    console.error("Error importing public module:", error);
    throw error;
  }
}

class BookDataLoader {
  private static instance: BookDataLoader;
  private currentBook: string | null = null;

  private constructor() {}

  static getInstance(): BookDataLoader {
    if (!BookDataLoader.instance) {
      BookDataLoader.instance = new BookDataLoader();
    }
    return BookDataLoader.instance;
  }

  // Get the current book from URL parameter
  getCurrentBook(): string {
    if (this.currentBook) {
      return this.currentBook;
    }
    let book;

    if (typeof window !== "undefined" && window.location) {
      const urlParams = new URLSearchParams(window.location.search);
      book = urlParams.get("book") || "Romeo-And-Juliet-Small";
    } else {
      book = process.env.VITE_BOOK;
    }

    this.currentBook = book;
    return book;
  }

  // Generic loader for any book data file
  async loadBookDataFile<T>(fileName: string): Promise<T> {
    const book = this.getCurrentBook();

    try {
      // Always load fresh with cache busting
      const timestamp = Date.now();
      // Use importPublicModule in vite dev, otherwise use dynamic import
      // const moduleUrl = `${getBookDataUrl(fileName)}.js?t=${timestamp}`;
      // console.log("Loading module:", moduleUrl);
      let module;
      if (import.meta.env && import.meta.env.DEV) {
        module = await importPublicModule(`${getBookDataUrl(fileName)}.js?t=${timestamp}`);
      } else {
        module = await import(/* @vite-ignore */ `${getBookDataUrl(fileName)}.js?t=${timestamp}`);
      }

      // Extract the default export or the named export matching the file name
      const functionName = fileName.replace(".js", "");
      const data = module[functionName] || module.default;

      return data as T;
    } catch (error) {
      console.error(`Failed to load ${fileName} for book ${book}:`, error);
      throw new Error(`Failed to load book data: ${fileName}`);
    }
  }

  // Specific loaders for each data type
  async getBookData(): Promise<BookData> {
    const bookData = await this.loadBookDataFile<BookData>("bookData");
    return bookData;
  }

  async getAllVariants(): Promise<Variant[]> {
    const getAllVariants = await this.loadBookDataFile<() => Variant[]>("getAllVariants");
    return typeof getAllVariants === "function" ? getAllVariants() : getAllVariants;
  }

  async getAudiobookTracksForBook(): Promise<AudiobookTracksSection[]> {
    const getter = await this.loadBookDataFile<() => AudiobookTracksSection[]>("getAudiobookTracksForBook");
    return typeof getter === "function" ? getter() : getter;
  }

  async getBackgroundSongsForBook(): Promise<BackgroundSongSection[]> {
    const getter = await this.loadBookDataFile<() => BackgroundSongSection[]>("getBackgroundSongsForBook");
    return typeof getter === "function" ? getter() : getter;
  }

  async getBackgroundsForBook(): Promise<BackgroundForBook[]> {
    const getter = await this.loadBookDataFile<() => BackgroundForBook[]>("getBackgroundsForBook");
    return typeof getter === "function" ? getter() : getter;
  }

  async getBookStringified(): Promise<string> {
    const getter = await this.loadBookDataFile<() => string>("getBookStringified");
    return typeof getter === "function" ? getter() : getter;
  }

  async getCharactersData(): Promise<CharacterData[]> {
    const getter = await this.loadBookDataFile<() => CharacterData[]>("getCharactersData");
    return typeof getter === "function" ? getter() : getter;
  }

  async getCutScenesForBook(): Promise<CutSceneForBook[]> {
    const getter = await this.loadBookDataFile<() => CutSceneForBook[]>("getCutScenesForBook");
    return typeof getter === "function" ? getter() : getter;
  }

  async getKnownVideoFiles(): Promise<string[]> {
    const getter = await this.loadBookDataFile<() => string[]>("getKnownVideoFiles");
    return typeof getter === "function" ? getter() : getter;
  }

  async getQuizQuestions(): Promise<QuizOutput[]> {
    const getter = await this.loadBookDataFile<() => QuizOutput[]>("getQuizQuestions");
    return typeof getter === "function" ? getter() : getter;
  }

  // Reset current book (useful for switching books)
  resetCurrentBook(): void {
    this.currentBook = null;
  }
}

export const bookDataLoader = BookDataLoader.getInstance();
