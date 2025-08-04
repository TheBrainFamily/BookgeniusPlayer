// Service to dynamically load book data at runtime
import type { BookData, BackgroundForBook, BackgroundSongSection, CutSceneForBook, CharacterData, AudiobookTracksSection, QuizOutput } from "@/types/book";
import type { Variant } from "@/genericBookDataGetters/getAllVariants";

class BookDataLoader {
  private static instance: BookDataLoader;
  private cache: Map<string, unknown> = new Map();
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

    const urlParams = new URLSearchParams(window.location.search);
    const book = urlParams.get("book") || "Romeo-And-Juliet-Small";
    this.currentBook = book;
    return book;
  }

  // Generic loader for any book data file
  async loadBookDataFile<T>(fileName: string): Promise<T> {
    const book = this.getCurrentBook();
    const cacheKey = `${book}/${fileName}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as T;
    }

    try {
      // Load the compiled JS module
      const module = await import(`/public/${book}/compiled/${fileName}.js`);

      // Extract the default export or the named export matching the file name
      const functionName = fileName.replace(".js", "");
      const data = module[functionName] || module.default;

      // Cache the result
      this.cache.set(cacheKey, data);

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

  // Clear cache if needed
  clearCache(): void {
    this.cache.clear();
  }

  // Reset current book (useful for switching books)
  resetCurrentBook(): void {
    this.currentBook = null;
    this.clearCache();
  }
}

export const bookDataLoader = BookDataLoader.getInstance();
