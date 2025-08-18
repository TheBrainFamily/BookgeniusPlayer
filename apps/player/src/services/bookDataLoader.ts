// Service to dynamically load book data at runtime
import type { BookData, BackgroundForBook, BackgroundSongSection, CutSceneForBook, CharacterData, AudiobookTracksSection } from "@player/types/book";
import type { Variant } from "@player/genericBookDataGetters/getAllVariants";
import { getBookDataModuleUrl } from "@player/utils/getbookDataModuleUrl";

async function importPublicModule(moduleUrl: string) {
  try {
    const response = await fetch(moduleUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${moduleUrl}: ${response.statusText}`);
    }
    const text = await response.text();
    const dataUrl = `data:application/javascript;charset=utf-8,${encodeURIComponent(text)}`;
    return await import(/* @vite-ignore */ dataUrl);
  } catch (error) {
    console.error("Error importing public module:", error);
    throw error;
  }
}

class BookDataLoader {
  private static instance: BookDataLoader;
  private currentBook: string | null = null;

  // New: split asset base into prefix + tokenQuery for clarity and safe composition
  // assetPrefix example: "https://cdn.example.com/staging/pr-394-notimestamp/assets/books/1984/v2025..."
  // assetQuery example: "expires=...&token=...&token_path=%2Fstaging%2F..."
  private assetPrefix: string | null = null;
  private assetQuery: string | null = null;

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

  setCurrentBook(slug: string) {
    this.currentBook = slug;
  }

  /**
   * Set asset base.
   *
   * Two forms:
   *  - setAssetBase(null) -> clears
   *  - setAssetBase(fullUrl) -> parses and splits into prefix + query
   *  - setAssetBase(prefix, query) -> explicit set
   *
   * prefix must not contain a trailing slash (we normalize).
   * query should be raw (no leading '?').
   */
  setAssetBase(prefixOrFull: string | null, query?: string | null) {
    if (!prefixOrFull) {
      this.assetPrefix = null;
      this.assetQuery = null;
      console.debug("[bookDataLoader] cleared asset base");
      return;
    }

    // if caller passed a (prefix, query) explicitly
    if (typeof query === "string") {
      this.assetPrefix = (prefixOrFull || "").replace(/\/+$/, "");
      this.assetQuery = query ? query.replace(/^\?/, "") : null;
      console.debug("[bookDataLoader] assetPrefix set (explicit)", this.assetPrefix, this.assetQuery);
      return;
    }

    // otherwise we got a full URL maybe containing query params -> parse
    try {
      const u = new URL(prefixOrFull);
      const prefixNoSlash = u.origin + u.pathname.replace(/\/+$/, "");
      // u.search starts with '?', strip it
      const q = u.search ? u.search.replace(/^\?/, "") : null;
      this.assetPrefix = prefixNoSlash;
      this.assetQuery = q;
      console.debug("[bookDataLoader] assetPrefix set (parsed)", this.assetPrefix, this.assetQuery);
    } catch (err) {
      // fallback: treat whole value as prefix (no query)
      this.assetPrefix = prefixOrFull.replace(/\/+$/, "");
      this.assetQuery = null;
      console.debug("[bookDataLoader] assetPrefix set (fallback)", this.assetPrefix);
    }
  }

  getAssetPrefix(): string | null {
    return this.assetPrefix;
  }

  getAssetQuery(): string | null {
    return this.assetQuery;
  }

  // Generic loader for any book data file
  async loadBookDataFile<T>(fileName: string): Promise<T> {
    const book = this.getCurrentBook();

    try {
      // Always load fresh in dev (cache-busting)
      const timestamp = Date.now();
      let module;
      if (import.meta.env && import.meta.env.DEV) {
        const moduleUrl = getBookDataModuleUrl(fileName, timestamp);
        console.log("Loading module (dev):", moduleUrl);
        module = await importPublicModule(moduleUrl);
      } else {
        const moduleUrl = getBookDataModuleUrl(fileName, null);
        module = await import(/* @vite-ignore */ moduleUrl);
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

  // Reset current book (useful for switching books)
  resetCurrentBook(): void {
    this.currentBook = null;
    this.assetPrefix = null;
    this.assetQuery = null;
  }
}

export const bookDataLoader = BookDataLoader.getInstance();
