/**
 * BookConvexContext - Convex-based book data provider (HTML Source format only)
 *
 * This context provides all book data from Convex with reactive updates.
 * It loads pre-compiled HTML from chapters-source/ folder.
 *
 * Books must be migrated to HTML source format before they can be loaded.
 * Run: bun apps/bookgenius-cms/scripts/migrate-book-to-html.ts <book-slug>
 */

import React, { createContext, useContext, useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useDraftMode } from "./DraftModeContext";
import { detectSourceFormat, normalizeChapterHtml, extractCharacterOccurrences, type CharacterOccurrence } from "@player/services/htmlNormalizer";
import { setBookDataStore, clearBookDataStore, type Note, type Variant } from "@player/state/bookDataStore";
import { setListensToSpeaksUrls, setLiveAssetUrls } from "@player/utils/assetUrls";
import type { BackgroundForBook, BackgroundSongSection, CharacterData, CharacterMedia, BookData, Chapter as ChapterTitle } from "@player/types/book";
import { bookIndex } from "@player/logic/BookIndex";
import type { CharacterIndex, ChapterOccurrences } from "@convex/lib/characterDataV2";
import { mergeV2ToCharacterData } from "@convex/lib/characterDataV2";

// =============================================================================
// Types
// =============================================================================

export interface ChapterInfo {
  path: string;
  basename: string;
  versionId: string;
  chapterNumber: number;
  title?: string;
  url?: string;
  state?: string;
  hasDraft?: boolean;
}

type HtmlSourceChapterQueryItem = { basename: string; url: string; versionId: string; chapterNumber: number; title?: string; paragraphCount?: number; sourceFormat: string };

export interface CharacterBundle {
  path: string;
  slug: string;
  name: string;
  extra: { displayName?: string; summary?: string; aiPrompt?: string; avatarGenerationState?: "generating" | "ready" | "error" | "none"; avatarProposalUrls?: string[] };
  avatar?: { url: string; versionId: string; contentType?: string };
  avatarLarge?: { url: string; versionId: string; contentType?: string };
  speaks?: { url: string; versionId: string; contentType?: string };
  listens?: { url: string; versionId: string; contentType?: string };
}

export interface BackgroundInfo {
  path: string;
  basename: string;
  url?: string;
  chapter: number;
  paragraph: number;
  backgroundColor?: string;
  textColor?: string;
}

export interface MusicInfo {
  path: string;
  basename: string;
  url?: string;
  chapter: number;
  paragraph: number;
}

export interface BookMetadata {
  path: string;
  slug: string;
  name: string;
  extra: { title?: string; author?: string; language?: string; form?: string };
}

type ChapterHtmlEntry = { chapterNumber: number; html?: string };

const buildChapterPlaceholderHtml = (chapterNumber: number): string => {
  return `<section><section data-chapter="${chapterNumber}"></section></section>`;
};

const buildBookHtmlFromChapters = (chapters: ChapterHtmlEntry[], bookForm: string): string => {
  let html = chapters
    .map((chapter) => {
      const chapterHtml = chapter.html ?? buildChapterPlaceholderHtml(chapter.chapterNumber);
      const format = detectSourceFormat(chapterHtml);
      if (format === "source") {
        return normalizeChapterHtml(chapterHtml);
      }
      return chapterHtml;
    })
    .join("");

  const form = bookForm.toLowerCase();
  if (form === "play") {
    html = `<div class="play-container">${html}</div>`;
  } else if (form === "mixed") {
    html = `<div class="play-container mixed-container">${html}</div>`;
  }

  return `<section>${html.trim()}</section>`;
};

interface BookConvexContextType {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  book: BookMetadata | null;
  chapters: ChapterInfo[];
  characters: CharacterBundle[];
  backgrounds: BackgroundInfo[];
  music: MusicInfo[];
  audiobookTracks: unknown[];
  cutScenes: unknown[];
  notes: Note[];
  variants: Variant[];
  bookStringified: string | null;
  chaptersData: ChapterTitle[];
  charactersData: CharacterData[];
  backgroundsForBook: BackgroundForBook[];
  backgroundSongsForBook: BackgroundSongSection[];
  bookData: BookData | null;
  knownVideoFiles: string[];
  textVersion: number;
  getChapterContent: (versionId: string, url?: string) => Promise<string | null>;
  getCachedChapterContent: (versionId: string) => string | null;
  reloadChapters: () => Promise<void>;
  ensureCompiledChaptersLoaded: (chapterNumbers: number[]) => Promise<void>;
  prefetchChaptersUpTo: (chapterNumber: number) => Promise<void>;
}

const defaultContext: BookConvexContextType = {
  isLoading: true,
  isReady: false,
  error: null,
  book: null,
  chapters: [],
  characters: [],
  backgrounds: [],
  music: [],
  audiobookTracks: [],
  cutScenes: [],
  notes: [],
  variants: [],
  bookStringified: null,
  chaptersData: [],
  charactersData: [],
  backgroundsForBook: [],
  backgroundSongsForBook: [],
  bookData: null,
  knownVideoFiles: [],
  textVersion: 0,
  getChapterContent: async () => null,
  getCachedChapterContent: () => null,
  reloadChapters: async () => {},
  ensureCompiledChaptersLoaded: async () => {},
  prefetchChaptersUpTo: async () => {},
};

const BookConvexContext = createContext<BookConvexContextType>(defaultContext);

// =============================================================================
// Provider
// =============================================================================

interface BookConvexProviderProps {
  bookPath: string;
  children: React.ReactNode;
}

export function BookConvexProvider({ bookPath, children }: BookConvexProviderProps) {
  const draftMode = useDraftMode();

  const [bookStringified, setBookStringified] = useState<string | null>(null);
  const [chaptersData, setChaptersData] = useState<ChapterTitle[]>([]);
  const [charactersData, setCharactersData] = useState<CharacterData[]>([]);
  const [textVersion, setTextVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const chapterContentCache = useRef<Map<string, string>>(new Map());
  const htmlSourceCacheRef = useRef<Map<number, { versionId: string; html: string; occurrences: CharacterOccurrence[] }>>(new Map());
  const prevContentSignatureRef = useRef<string>("");
  const initialLoadCompleteRef = useRef(false);
  const lastRequestedChaptersRef = useRef<number[]>([]);

  const bookSlug = useMemo(() => bookPath.split("/").pop() || "", [bookPath]);

  // =============================================================================
  // Queries - HTML Source format only
  // =============================================================================

  const bookMetadata = useQuery(api.bookQueries.getBookMetadata, { bookPath });
  const htmlSourceChaptersQuery = useQuery(api.bookQueries.listHtmlSourceChapters, { bookPath }) as HtmlSourceChapterQueryItem[] | null | undefined;
  const charactersQuery = useQuery(api.bookQueries.listCharacterBundlesWithDrafts, { bookPath });
  const backgroundsQuery = useQuery(draftMode ? api.backgroundCues.listForPlayerWithDrafts : api.backgroundCues.listForPlayer, { bookPath });
  const musicQuery = useQuery(draftMode ? api.musicCues.listForPlayerWithDrafts : api.musicCues.listForPlayer, { bookPath });
  const audiobookTracksQuery = useQuery(api.bookQueries.listAudiobookTracks, { bookPath });
  const cutScenesQuery = useQuery(api.bookQueries.listCutScenes, { bookPath });
  const notesQuery = useQuery(api.bookQueries.listNotes, { bookPath });
  const variantsQuery = useQuery(api.bookQueries.listVariants, { bookPath });

  const getTextContent = useAction(api.cli.getTextContent);

  // =============================================================================
  // Derived state
  // =============================================================================

  const book = useMemo<BookMetadata | null>(() => {
    if (!bookMetadata) return null;
    return { path: bookMetadata.path, slug: bookMetadata.slug, name: bookMetadata.name, extra: bookMetadata.extra as BookMetadata["extra"] };
  }, [bookMetadata]);

  const htmlSourceByNumber = useMemo(() => {
    if (!htmlSourceChaptersQuery) return new Map<number, HtmlSourceChapterQueryItem>();
    return new Map(htmlSourceChaptersQuery.map((c) => [c.chapterNumber, c]));
  }, [htmlSourceChaptersQuery]);

  const chapterOrder = useMemo(() => {
    if (!htmlSourceChaptersQuery) return [];
    return htmlSourceChaptersQuery.map((c) => c.chapterNumber).sort((a, b) => a - b);
  }, [htmlSourceChaptersQuery]);

  const chapters = useMemo<ChapterInfo[]>(() => {
    if (!htmlSourceChaptersQuery) return [];
    return htmlSourceChaptersQuery.map((c) => ({
      path: "",
      basename: c.basename,
      versionId: c.versionId,
      chapterNumber: c.chapterNumber,
      title: c.title,
      url: c.url,
      state: "published",
      hasDraft: false,
    }));
  }, [htmlSourceChaptersQuery]);

  const chapterStructure = useMemo(
    () => chapters.map((chapter) => ({ chapterNumber: chapter.chapterNumber, paragraphCount: htmlSourceByNumber.get(chapter.chapterNumber)?.paragraphCount ?? 0 })),
    [chapters, htmlSourceByNumber],
  );

  useEffect(() => {
    if (draftMode || chapterStructure.length === 0) return;
    bookIndex.setParagraphCountOverrides(chapterStructure);
    const totalParagraphs = chapterStructure.reduce((sum, entry) => sum + entry.paragraphCount, 0);
    console.log("[BookConvex] Paragraph counts set", { chapters: chapterStructure.length, totalParagraphs });
  }, [draftMode, chapterStructure]);

  const characters = useMemo<CharacterBundle[]>(() => {
    if (!charactersQuery) return [];
    return charactersQuery.map((c) => ({
      path: c.path,
      slug: c.slug,
      name: c.name,
      extra: c.extra as CharacterBundle["extra"],
      avatar: c.avatar,
      avatarLarge: c.avatarLarge,
      speaks: c.speaks,
      listens: c.listens,
    }));
  }, [charactersQuery]);

  const backgrounds = useMemo<BackgroundInfo[]>(() => {
    if (!backgroundsQuery) return [];
    return backgroundsQuery.map((b) => ({
      path: "",
      basename: b.file,
      url: b.url,
      chapter: b.startChapter,
      paragraph: b.startParagraph,
      backgroundColor: b.backgroundColor,
      textColor: b.textColor,
    }));
  }, [backgroundsQuery]);

  const music = useMemo<MusicInfo[]>(() => {
    if (!musicQuery) return [];
    return musicQuery.map((m) => ({ path: "", basename: m.files[0]?.split("/").pop() ?? "", url: m.files[0], chapter: m.chapter, paragraph: m.paragraph }));
  }, [musicQuery]);

  const backgroundsForBook = useMemo<BackgroundForBook[]>(() => {
    if (!backgroundsQuery) return [];
    return backgroundsQuery
      .filter((b) => b.url)
      .map((b) => ({ chapter: b.startChapter, paragraph: b.startParagraph, file: b.url!, backgroundColor: b.backgroundColor, textColor: b.textColor }));
  }, [backgroundsQuery]);

  const backgroundSongsForBook = useMemo<BackgroundSongSection[]>(() => {
    if (!musicQuery) return [];
    return musicQuery.filter((m) => m.files.length > 0 && m.files[0]);
  }, [musicQuery]);

  const knownVideoFiles = useMemo<string[]>(() => {
    const videos: string[] = [];
    for (const char of characters) {
      const pattern = char.slug.toLowerCase().replace(/ /g, "-").replace(/"/g, "").replace(/[()]/g, "");
      if (char.speaks) videos.push(`${pattern}-speaks.mp4`);
      if (char.listens) videos.push(`${pattern}-listens.mp4`);
    }
    return videos;
  }, [characters]);

  const bookData = useMemo<BookData | null>(() => {
    if (!book) return null;
    return {
      slug: bookSlug,
      metadata: { title: book.name, author: book.extra.author, language: book.extra.language, bookForm: book.extra.form?.toLowerCase() },
      chapters: chaptersData,
      hasAudiobook: false,
    };
  }, [book, bookSlug, chaptersData]);

  // =============================================================================
  // Chapter content fetching
  // =============================================================================

  const getChapterContent = useCallback(
    async (versionId: string, url?: string): Promise<string | null> => {
      const cached = chapterContentCache.current.get(versionId);
      if (cached) return cached;

      let content: string | null = null;

      if (url) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            content = await response.text();
          }
        } catch (fetchError) {
          console.warn("[BookConvex] Direct fetch failed, falling back to action:", fetchError);
        }
      }

      if (!content) {
        try {
          const result = await getTextContent({ versionId });
          content = result?.content ?? null;
        } catch (e) {
          console.error("[BookConvex] Action fallback failed:", e);
          return null;
        }
      }

      if (content) {
        chapterContentCache.current.set(versionId, content);
      }

      return content;
    },
    [getTextContent],
  );

  const getCachedChapterContent = useCallback((versionId: string): string | null => {
    return chapterContentCache.current.get(versionId) || null;
  }, []);

  // =============================================================================
  // HTML Source loading
  // =============================================================================

  const buildHtmlSourceSignature = useCallback((): string => {
    if (chapterOrder.length === 0) return "";
    const chapterSig = chapterOrder.map((n) => htmlSourceCacheRef.current.get(n)?.versionId ?? "missing").join("|");
    return `${chapterSig}:chars=${characters.length}`;
  }, [chapterOrder, characters]);

  const buildHtmlSourceChapterEntries = useCallback((): ChapterHtmlEntry[] => {
    return chapterOrder.map((chapterNumber) => {
      const cached = htmlSourceCacheRef.current.get(chapterNumber);
      return { chapterNumber, html: cached?.html };
    });
  }, [chapterOrder]);

  const updateFromHtmlSourceCache = useCallback(() => {
    if (htmlSourceCacheRef.current.size === 0) return;

    const signature = buildHtmlSourceSignature();
    if (signature === prevContentSignatureRef.current && bookStringified) {
      return;
    }

    console.log("[BookConvex] Building book HTML from cache", { cachedChapters: htmlSourceCacheRef.current.size });

    const bookForm = book?.extra?.form?.toLowerCase() || "book";
    const htmlResult = buildBookHtmlFromChapters(buildHtmlSourceChapterEntries(), bookForm);
    setBookStringified(htmlResult);

    const occurrencesByChapter: Record<number, ChapterOccurrences> = {};
    for (const [chapterNumber, entry] of htmlSourceCacheRef.current) {
      const chapterOccurrences: ChapterOccurrences = {};
      for (const occ of entry.occurrences) {
        if (!chapterOccurrences[occ.slug]) {
          chapterOccurrences[occ.slug] = { s: [], t: [] };
        }
        if (occ.isSpeaking) {
          chapterOccurrences[occ.slug].t.push(occ.paragraph);
        } else {
          chapterOccurrences[occ.slug].s.push(occ.paragraph);
        }
        if (occ.isEntering) {
          if (!chapterOccurrences[occ.slug].e) chapterOccurrences[occ.slug].e = [];
          chapterOccurrences[occ.slug].e!.push(occ.paragraph);
        }
        if (occ.isExiting) {
          if (!chapterOccurrences[occ.slug].x) chapterOccurrences[occ.slug].x = [];
          chapterOccurrences[occ.slug].x!.push(occ.paragraph);
        }
      }
      occurrencesByChapter[chapterNumber] = chapterOccurrences;
    }

    const form = bookForm === "play" ? "play" : bookForm === "mixed" ? "mixed" : "prose";
    const characterIndex: CharacterIndex = { form, characters: {} };
    for (const char of characters) {
      characterIndex.characters[char.slug] = { name: char.extra.displayName ?? char.name, summary: char.extra.summary ?? "" };
    }

    const merged = mergeV2ToCharacterData(characterIndex, occurrencesByChapter, bookSlug);
    const mediaBySlug = new Map<string, CharacterMedia>();
    for (const char of characters) {
      mediaBySlug.set(char.slug.toLowerCase(), { avatarUrl: char.avatar?.url, listensUrl: char.listens?.url, speaksUrl: char.speaks?.url });
    }
    for (const char of merged) {
      const media = mediaBySlug.get(char.slug.toLowerCase());
      if (media) char.media = { ...char.media, ...media };
    }

    console.log("[BookConvex] Characters merged", { count: merged.length });
    setCharactersData(merged);

    prevContentSignatureRef.current = signature;

    if (!initialLoadCompleteRef.current) {
      initialLoadCompleteRef.current = true;
    }

    setTextVersion((v) => v + 1);
  }, [book, bookSlug, bookStringified, buildHtmlSourceChapterEntries, buildHtmlSourceSignature, characters]);

  const normalizeRequestedChapters = useCallback(
    (chapterNumbers: number[]): number[] => {
      if (chapterNumbers.length === 0 || chapterOrder.length === 0) return [];
      const chapterSet = new Set(chapterOrder);
      const unique = Array.from(new Set(chapterNumbers)).filter((n) => chapterSet.has(n));
      unique.sort((a, b) => a - b);
      return unique;
    },
    [chapterOrder],
  );

  const ensureHtmlSourceChaptersLoaded = useCallback(
    async (chapterNumbers: number[]) => {
      const requested = normalizeRequestedChapters(chapterNumbers);
      if (requested.length === 0) return;

      lastRequestedChaptersRef.current = requested;

      const toFetch = requested.filter((chapterNumber) => {
        const entry = htmlSourceByNumber.get(chapterNumber);
        if (!entry?.versionId) return false;
        const cached = htmlSourceCacheRef.current.get(chapterNumber);
        return !cached || cached.versionId !== entry.versionId;
      });

      if (toFetch.length > 0) {
        console.log("[BookConvex] Fetching HTML source chapters", { toFetch });

        const results = await Promise.all(
          toFetch.map(async (chapterNumber) => {
            const entry = htmlSourceByNumber.get(chapterNumber);
            if (!entry?.url) return null;
            try {
              const response = await fetch(entry.url);
              if (!response.ok) return null;
              const html = await response.text();
              const normalizedHtml = normalizeChapterHtml(html);
              const parser = new DOMParser();
              const doc = parser.parseFromString(normalizedHtml, "text/html");
              const section = doc.querySelector("section[data-chapter]");
              const occurrences = section ? extractCharacterOccurrences(section, chapterNumber) : [];
              return { chapterNumber, versionId: entry.versionId, html, occurrences };
            } catch {
              return null;
            }
          }),
        );

        const successful = results.filter((r): r is { chapterNumber: number; versionId: string; html: string; occurrences: CharacterOccurrence[] } => Boolean(r));

        if (successful.length === 0 && htmlSourceCacheRef.current.size === 0) {
          setError("Failed to load any chapters");
          return;
        }

        for (const result of successful) {
          htmlSourceCacheRef.current.set(result.chapterNumber, { versionId: result.versionId, html: result.html, occurrences: result.occurrences });
        }
      }

      updateFromHtmlSourceCache();
    },
    [htmlSourceByNumber, normalizeRequestedChapters, updateFromHtmlSourceCache],
  );

  const ensureCompiledChaptersLoaded = useCallback(
    async (chapterNumbers: number[]) => {
      await ensureHtmlSourceChaptersLoaded(chapterNumbers);
    },
    [ensureHtmlSourceChaptersLoaded],
  );

  const getChaptersUpTo = useCallback(
    (endChapter: number): number[] => {
      if (chapterOrder.length === 0) return [];
      return chapterOrder.filter((n) => n <= endChapter);
    },
    [chapterOrder],
  );

  const prefetchChaptersUpTo = useCallback(
    async (chapterNumber: number) => {
      if (chapterNumber <= 0) return;
      const chaptersToFetch = getChaptersUpTo(chapterNumber);
      if (chaptersToFetch.length === 0) return;
      await ensureCompiledChaptersLoaded(chaptersToFetch);
    },
    [ensureCompiledChaptersLoaded, getChaptersUpTo],
  );

  const reloadChapters = useCallback(async () => {
    chapterContentCache.current.clear();
    htmlSourceCacheRef.current.clear();
    prevContentSignatureRef.current = "";

    if (lastRequestedChaptersRef.current.length > 0) {
      await ensureCompiledChaptersLoaded(lastRequestedChaptersRef.current);
    }
  }, [ensureCompiledChaptersLoaded]);

  // =============================================================================
  // Effects
  // =============================================================================

  useEffect(() => {
    chapterContentCache.current.clear();
    htmlSourceCacheRef.current.clear();
    prevContentSignatureRef.current = "";
    initialLoadCompleteRef.current = false;
    lastRequestedChaptersRef.current = [];
    setBookStringified(null);
    setChaptersData([]);
    setCharactersData([]);
    setError(null);
  }, [draftMode, bookPath]);

  useEffect(() => {
    if (htmlSourceChaptersQuery === undefined) return;

    if (htmlSourceChaptersQuery === null || htmlSourceChaptersQuery.length === 0) {
      console.error("[BookConvex] No HTML source chapters found - book needs migration");
      console.error("[BookConvex] Run: bun apps/bookgenius-cms/scripts/migrate-book-to-html.ts", bookSlug);
      setError(`Book "${bookSlug}" has not been migrated to HTML source format. Run the migration script.`);
      return;
    }

    const titleMap = new Map(htmlSourceChaptersQuery.map((c) => [c.chapterNumber, c.title]));
    setChaptersData(chapterOrder.map((chapterNumber) => ({ id: String(chapterNumber), title: titleMap.get(chapterNumber) ?? "" })));
  }, [htmlSourceChaptersQuery, chapterOrder, bookSlug]);

  useEffect(() => {
    if (!characters.length || !initialLoadCompleteRef.current) return;

    setCharactersData((prev) => {
      if (prev.length === 0) return prev;

      return prev.map((char) => {
        const bundle = characters.find((c) => c.slug.toLowerCase() === char.slug.toLowerCase());
        if (!bundle) return char;

        return {
          ...char,
          characterName: bundle.extra.displayName ?? bundle.name,
          infoPerChapter: char.infoPerChapter.map((chapterInfo) => ({ ...chapterInfo, summary: bundle.extra.summary ?? "" })),
          media: { avatarUrl: bundle.avatar?.url, listensUrl: bundle.listens?.url, speaksUrl: bundle.speaks?.url },
        };
      });
    });
  }, [characters]);

  useEffect(() => {
    if (!characters.length) return;

    const listensToSpeaks = new Map<string, string>();
    const videoToAvatar = new Map<string, string>();

    for (const char of characters) {
      if (char.listens?.url && char.speaks?.url) {
        listensToSpeaks.set(char.listens.url, char.speaks.url);
      }
      if (char.listens?.url && char.avatar?.url) {
        videoToAvatar.set(char.listens.url, char.avatar.url);
      }
      if (char.speaks?.url && char.avatar?.url) {
        videoToAvatar.set(char.speaks.url, char.avatar.url);
      }
    }

    setListensToSpeaksUrls(listensToSpeaks);
    setLiveAssetUrls(new Map(), videoToAvatar);
  }, [characters]);

  // =============================================================================
  // Loading state
  // =============================================================================

  const isLoading =
    bookMetadata === undefined || htmlSourceChaptersQuery === undefined || charactersQuery === undefined || backgroundsQuery === undefined || musicQuery === undefined;

  const isReady = !isLoading && !error && bookStringified !== null && initialLoadCompleteRef.current;

  // =============================================================================
  // Context value
  // =============================================================================

  const value = useMemo<BookConvexContextType>(
    () => ({
      isLoading,
      isReady,
      error,
      book,
      chapters,
      characters,
      backgrounds,
      music,
      audiobookTracks: audiobookTracksQuery ?? [],
      cutScenes: cutScenesQuery ?? [],
      notes: notesQuery ?? [],
      variants: variantsQuery ?? [],
      bookStringified,
      chaptersData,
      charactersData,
      backgroundsForBook,
      backgroundSongsForBook,
      bookData,
      knownVideoFiles,
      textVersion,
      getChapterContent,
      getCachedChapterContent,
      reloadChapters,
      ensureCompiledChaptersLoaded,
      prefetchChaptersUpTo,
    }),
    [
      isLoading,
      isReady,
      error,
      book,
      chapters,
      characters,
      backgrounds,
      music,
      audiobookTracksQuery,
      cutScenesQuery,
      notesQuery,
      variantsQuery,
      bookStringified,
      chaptersData,
      charactersData,
      backgroundsForBook,
      backgroundSongsForBook,
      bookData,
      knownVideoFiles,
      textVersion,
      getChapterContent,
      getCachedChapterContent,
      reloadChapters,
      ensureCompiledChaptersLoaded,
      prefetchChaptersUpTo,
    ],
  );

  useLayoutEffect(() => {
    setBookDataStore({
      isLoading,
      isReady,
      error,
      book,
      chapters,
      characters,
      backgrounds,
      music,
      bookStringified,
      chaptersData,
      charactersData,
      backgroundsForBook,
      backgroundSongsForBook,
      bookData,
      knownVideoFiles,
      textVersion,
      notes: notesQuery ?? [],
      variants: variantsQuery ?? [],
      cutScenes: cutScenesQuery ?? [],
      audiobookTracks: audiobookTracksQuery ?? [],
    });
  }, [
    isLoading,
    isReady,
    error,
    book,
    chapters,
    characters,
    backgrounds,
    music,
    bookStringified,
    chaptersData,
    charactersData,
    backgroundsForBook,
    backgroundSongsForBook,
    bookData,
    knownVideoFiles,
    textVersion,
    notesQuery,
    variantsQuery,
    cutScenesQuery,
    audiobookTracksQuery,
  ]);

  useEffect(() => {
    return () => {
      clearBookDataStore();
    };
  }, []);

  return <BookConvexContext.Provider value={value}>{children}</BookConvexContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

export function useBookConvex() {
  return useContext(BookConvexContext);
}

export function useCharacterMap() {
  const { characters } = useBookConvex();

  return useMemo(() => {
    const map = new Map<string, CharacterBundle>();
    for (const char of characters) {
      map.set(char.slug.toLowerCase(), char);
      if (char.name && char.name.toLowerCase() !== char.slug.toLowerCase()) {
        map.set(char.name.toLowerCase(), char);
      }
    }
    return map;
  }, [characters]);
}
