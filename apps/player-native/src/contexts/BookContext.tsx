import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type {
  BackgroundForBook,
  CharacterBundle,
  CharacterData,
  ChapterInfo,
  BookMetadata,
  Chapter,
} from "@player-native/types/book";

// =============================================================================
// Types
// =============================================================================

interface BookContextValue {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  bookPath: string;
  bookSlug: string;
  book: BookMetadata | null;
  chapters: ChapterInfo[];
  chaptersData: Chapter[];
  characters: CharacterBundle[];
  charactersData: CharacterData[];
  backgroundsForBook: BackgroundForBook[];
  bookHtml: string | null;
  getChapterHtml: (chapterNumber: number) => Promise<string | null>;
}

const BookContext = createContext<BookContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface BookProviderProps {
  bookPath: string;
  children: React.ReactNode;
}

export const BookProvider: React.FC<BookProviderProps> = ({ bookPath, children }) => {
  const bookSlug = useMemo(() => bookPath.split("/").pop() || "", [bookPath]);
  const [bookHtml, setBookHtml] = useState<string | null>(null);
  const chapterCache = useRef<Map<number, string>>(new Map());

  // =============================================================================
  // Convex Queries
  // =============================================================================

  const bookMetadata = useQuery(api.bookQueries.getBookMetadata, { bookPath });

  const htmlSourceChaptersQuery = useQuery(api.bookQueries.listHtmlSourceChapters, { bookPath });

  const charactersQuery = useQuery(api.bookQueries.listCharacterBundlesWithDrafts, { bookPath });

  const backgroundsQuery = useQuery(api.backgroundCues.listForPlayer, { bookPath });

  const characterIndexQuery = useQuery(api.bookQueries.getCharacterIndexV2, { bookPath });

  // =============================================================================
  // Derived State
  // =============================================================================

  const book = useMemo<BookMetadata | null>(() => {
    if (!bookMetadata) return null;
    const extra = bookMetadata.extra as Record<string, unknown> | undefined;
    return {
      title: (extra?.title as string) || bookMetadata.name || bookSlug,
      author: (extra?.author as string) || "Unknown",
      language: extra?.language as string | undefined,
      bookForm: extra?.bookForm as string | undefined,
    };
  }, [bookMetadata, bookSlug]);

  const chapters = useMemo<ChapterInfo[]>(() => {
    if (!htmlSourceChaptersQuery) return [];
    return (
      htmlSourceChaptersQuery as Array<{
        basename: string;
        url: string;
        versionId: string;
        chapterNumber: number;
        title?: string;
      }>
    ).map((c) => ({
      basename: c.basename,
      versionId: c.versionId,
      chapterNumber: c.chapterNumber,
      title: c.title,
      url: c.url,
    }));
  }, [htmlSourceChaptersQuery]);

  const chaptersData = useMemo<Chapter[]>(() => {
    return chapters.map((c) => ({
      id: String(c.chapterNumber),
      title: c.title || `Chapter ${c.chapterNumber}`,
      chapterNumber: c.chapterNumber,
    }));
  }, [chapters]);

  const characters = useMemo<CharacterBundle[]>(() => {
    if (!charactersQuery) return [];
    return (
      charactersQuery as Array<{
        path: string;
        slug: string;
        name: string;
        extra: Record<string, unknown>;
        avatar?: { url: string; versionId: string };
        speaks?: { url: string; versionId: string };
        listens?: { url: string; versionId: string };
      }>
    ).map((c) => ({
      path: c.path,
      slug: c.slug,
      name: c.name,
      extra: {
        displayName: c.extra?.displayName as string | undefined,
        summary: c.extra?.summary as string | undefined,
      },
      avatar: c.avatar,
      speaks: c.speaks,
      listens: c.listens,
    }));
  }, [charactersQuery]);

  const charactersData = useMemo<CharacterData[]>(() => {
    if (!characterIndexQuery || !characters.length) return [];

    const index = characterIndexQuery as {
      characters?: Record<
        string,
        { name: string; chapters?: Record<string, { s?: number[]; t?: number[]; e?: number[] }> }
      >;
    };

    if (!index.characters) return [];

    return Object.entries(index.characters).map(([slug, charData]) => {
      const bundle = characters.find((c) => c.slug === slug);
      const infoPerChapter = Object.entries(charData.chapters || {}).map(([chapterStr, occ]) => ({
        chapter: parseInt(chapterStr, 10),
        summary: "",
        paragraphsWhereSpotted: occ.s || [],
        paragraphsWhereTalking: occ.t || [],
        paragraphsWhereEnters: occ.e || [],
      }));

      return {
        slug,
        characterName: charData.name || bundle?.name || slug,
        bookSlug,
        infoPerChapter,
        media: bundle
          ? {
              avatarUrl: bundle.avatar?.url,
              listensUrl: bundle.listens?.url,
              speaksUrl: bundle.speaks?.url,
            }
          : undefined,
      };
    });
  }, [characterIndexQuery, characters, bookSlug]);

  const backgroundsForBook = useMemo<BackgroundForBook[]>(() => {
    if (!backgroundsQuery) return [];
    return (
      backgroundsQuery as Array<{
        startChapter: number;
        startParagraph: number;
        url?: string;
        backgroundColor?: string;
        textColor?: string;
      }>
    )
      .filter((bg) => bg.url)
      .map((bg) => ({
        chapter: bg.startChapter,
        paragraph: bg.startParagraph,
        file: bg.url!,
        backgroundColor: bg.backgroundColor,
        textColor: bg.textColor,
      }));
  }, [backgroundsQuery]);

  // =============================================================================
  // Chapter HTML Loading
  // =============================================================================

  const getChapterHtml = useCallback(
    async (chapterNumber: number): Promise<string | null> => {
      const cached = chapterCache.current.get(chapterNumber);
      if (cached) return cached;

      const chapter = chapters.find((c) => c.chapterNumber === chapterNumber);
      if (!chapter?.url) return null;

      try {
        const response = await fetch(chapter.url);
        if (!response.ok) return null;
        const html = await response.text();
        chapterCache.current.set(chapterNumber, html);
        return html;
      } catch (error) {
        console.error(`Failed to fetch chapter ${chapterNumber}:`, error);
        return null;
      }
    },
    [chapters],
  );

  // Load all chapters and build full HTML
  useEffect(() => {
    if (chapters.length === 0) return;

    const loadAllChapters = async () => {
      const htmlParts: string[] = [];

      for (const chapter of chapters.sort((a, b) => a.chapterNumber - b.chapterNumber)) {
        const html = await getChapterHtml(chapter.chapterNumber);
        if (html) {
          htmlParts.push(html);
        }
      }

      if (htmlParts.length > 0) {
        setBookHtml(htmlParts.join("\n"));
      }
    };

    loadAllChapters();
  }, [chapters, getChapterHtml]);

  // =============================================================================
  // Loading State
  // =============================================================================

  const isLoading =
    bookMetadata === undefined ||
    htmlSourceChaptersQuery === undefined ||
    charactersQuery === undefined;

  const isReady = !isLoading && bookHtml !== null;

  const error = useMemo(() => {
    if (bookMetadata === null) return `Book not found: ${bookPath}`;
    return null;
  }, [bookMetadata, bookPath]);

  // =============================================================================
  // Context Value
  // =============================================================================

  const value = useMemo<BookContextValue>(
    () => ({
      isLoading,
      isReady,
      error,
      bookPath,
      bookSlug,
      book,
      chapters,
      chaptersData,
      characters,
      charactersData,
      backgroundsForBook,
      bookHtml,
      getChapterHtml,
    }),
    [
      isLoading,
      isReady,
      error,
      bookPath,
      bookSlug,
      book,
      chapters,
      chaptersData,
      characters,
      charactersData,
      backgroundsForBook,
      bookHtml,
      getChapterHtml,
    ],
  );

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
};

// =============================================================================
// Hook
// =============================================================================

export const useBook = () => {
  const ctx = useContext(BookContext);
  if (!ctx) {
    throw new Error("useBook must be used within BookProvider");
  }
  return ctx;
};
