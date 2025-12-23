/**
 * BookConvexContext - Unified Convex-based book data provider.
 *
 * This context provides all book data from Convex with reactive updates.
 * It handles both published and draft modes, XML processing, and all
 * data transformations needed by the player.
 *
 * Features:
 * - Parallel queries for efficient loading
 * - Draft-aware queries based on DraftModeContext
 * - XML → HTML processing for chapter content
 * - Character metadata extraction
 * - textVersion tracking for reactivity
 * - Caching of processed content
 *
 * Usage:
 *   <BookConvexProvider bookPath="books/1984-English">
 *     <YourApp />
 *   </BookConvexProvider>
 *
 *   const { bookStringified, chapters, isReady } = useBookConvex();
 */

import React, { createContext, useContext, useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useDraftMode } from "./DraftModeContext";
import { xmlToComplexHtml, type CharacterBundleInfo } from "@player/services/live/xmlProcessor";
import { extractCharacterMetadata } from "@player/services/live/characterExtractor";
import { setBookDataStore, clearBookDataStore, type Note, type Variant } from "@player/state/bookDataStore";
import { setListensToSpeaksUrls, setLiveAssetUrls } from "@player/utils/assetUrls";
import type { BackgroundForBook, BackgroundSongSection, CharacterData, BookData, Chapter as ChapterTitle } from "@player/types/book";

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

/** Raw chapter data from Convex queries (listChapters / listChaptersWithDrafts) */
type ChapterQueryItem = { path: string; basename: string; versionId: string; chapterNumber: number; title?: string; url?: string; state?: string; hasDraft?: boolean };

export interface CharacterBundle {
  path: string;
  slug: string;
  name: string;
  extra: { displayName?: string; summary?: string; aiPrompt?: string };
  avatar?: { url: string; versionId: string; contentType?: string };
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

interface BookConvexContextType {
  // Loading states
  /** Whether initial queries are still loading */
  isLoading: boolean;
  /** Whether all data is processed and ready for rendering */
  isReady: boolean;
  /** Error message if loading failed */
  error: string | null;

  // Raw Convex data
  /** Book metadata */
  book: BookMetadata | null;
  /** Chapter list with versionIds */
  chapters: ChapterInfo[];
  /** Character bundles with media URLs */
  characters: CharacterBundle[];
  /** Background positions */
  backgrounds: BackgroundInfo[];
  /** Music positions */
  music: MusicInfo[];

  // Stub data (not yet in CMS - returns empty arrays)
  audiobookTracks: unknown[];
  cutScenes: unknown[];
  notes: Note[];
  variants: Variant[];

  // Processed content (player format)
  /** Processed HTML content */
  bookStringified: string | null;
  /** Chapter titles in player format */
  chaptersData: ChapterTitle[];
  /** Character metadata with appearance info */
  charactersData: CharacterData[];
  /** Backgrounds in player format */
  backgroundsForBook: BackgroundForBook[];
  /** Music in player format */
  backgroundSongsForBook: BackgroundSongSection[];
  /** Book data in player format */
  bookData: BookData | null;
  /** Known video files (derived from characters) */
  knownVideoFiles: string[];

  // Reactivity
  /** Version counter - increments when content changes */
  textVersion: number;

  // Actions
  /** Fetch chapter content by versionId (optionally with direct URL for faster fetch) */
  getChapterContent: (versionId: string, url?: string) => Promise<string | null>;
  /** Get cached chapter content */
  getCachedChapterContent: (versionId: string) => string | null;
  /** Force reload chapters */
  reloadChapters: () => Promise<void>;
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
  audiobookTracks: [] as unknown[],
  cutScenes: [] as unknown[],
  notes: [] as Note[],
  variants: [] as Variant[],
  bookStringified: null,
  chaptersData: [],
  charactersData: [],
  backgroundsForBook: [],
  backgroundSongsForBook: [],
  bookData: null,
  knownVideoFiles: [],
  textVersion: 0,
  getChapterContent: async (_versionId, _url) => null,
  getCachedChapterContent: () => null,
  reloadChapters: async () => {},
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

  // State for processed content
  const [bookStringified, setBookStringified] = useState<string | null>(null);
  const [chaptersData, setChaptersData] = useState<ChapterTitle[]>([]);
  const [charactersData, setCharactersData] = useState<CharacterData[]>([]);
  const [textVersion, setTextVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Chapter content cache
  const chapterContentCache = useRef<Map<string, string>>(new Map());

  // Track previous chapter versionIds to detect actual content changes
  const prevChapterVersionIdsRef = useRef<string>("");
  const initialLoadCompleteRef = useRef(false);
  const isProcessingRef = useRef(false);

  // Extract book slug from path
  const bookSlug = useMemo(() => bookPath.split("/").pop() || "", [bookPath]);

  // All queries run in parallel (Convex optimizes this)
  const bookMetadata = useQuery(api.bookQueries.getBookMetadata, { bookPath });

  // Use draft-aware or published-only queries based on draftMode
  const chaptersQuery = useQuery(draftMode ? api.bookQueries.listChaptersWithDrafts : api.bookQueries.listChapters, { bookPath }) as ChapterQueryItem[] | undefined;

  //TODO character always use drafts
  const charactersQuery = useQuery(api.bookQueries.listCharacterBundlesWithDrafts, { bookPath });

  const backgroundsQuery = useQuery(draftMode ? api.bookQueries.listBackgroundsWithDrafts : api.bookQueries.listBackgrounds, { bookPath });

  const musicQuery = useQuery(draftMode ? api.bookQueries.listMusicWithDrafts : api.bookQueries.listMusic, { bookPath });

  // Stub queries (return empty arrays)
  const audiobookTracksQuery = useQuery(api.bookQueries.listAudiobookTracks, { bookPath });
  const cutScenesQuery = useQuery(api.bookQueries.listCutScenes, { bookPath });
  const notesQuery = useQuery(api.bookQueries.listNotes, { bookPath });
  const variantsQuery = useQuery(api.bookQueries.listVariants, { bookPath });

  // Action for fetching chapter content
  const getTextContent = useAction(api.cli.getTextContent);

  // Fetch chapter content (with caching)
  // Prefers direct R2 fetch for speed (~50-100ms), falls back to Convex action if CORS fails
  const getChapterContent = useCallback(
    async (versionId: string, url?: string): Promise<string | null> => {
      // Check cache first
      const cached = chapterContentCache.current.get(versionId);
      if (cached) return cached;

      let content: string | null = null;

      // Try direct fetch first (faster - no Convex round-trip)
      if (url) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            content = await response.text();
          } else {
            console.warn(`[BookConvexContext] Direct fetch failed with status ${response.status}, falling back to action`);
          }
        } catch (fetchError) {
          console.warn("[BookConvexContext] Direct fetch failed (CORS?), falling back to action:", fetchError);
        }
      }

      // Fallback to Convex action if direct fetch failed or no URL provided
      if (!content) {
        try {
          const result = await getTextContent({ versionId });
          content = result?.content ?? null;
        } catch (e) {
          console.error("[BookConvexContext] Action fallback also failed:", e);
          return null;
        }
      }

      if (content) {
        chapterContentCache.current.set(versionId, content);
        return content;
      }

      return null;
    },
    [getTextContent],
  );

  // Get cached chapter content (synchronous)
  const getCachedChapterContent = useCallback((versionId: string): string | null => {
    return chapterContentCache.current.get(versionId) || null;
  }, []);

  // Transform book metadata
  const book = useMemo<BookMetadata | null>(() => {
    if (!bookMetadata) return null;
    return { path: bookMetadata.path, slug: bookMetadata.slug, name: bookMetadata.name, extra: bookMetadata.extra as BookMetadata["extra"] };
  }, [bookMetadata]);

  // Transform chapters (raw from Convex)
  const chapters = useMemo<ChapterInfo[]>(() => {
    if (!chaptersQuery) return [];
    return chaptersQuery.map((c) => ({
      path: c.path,
      basename: c.basename,
      versionId: c.versionId,
      chapterNumber: c.chapterNumber,
      title: c.title,
      url: c.url,
      state: c.state,
      hasDraft: c.hasDraft,
    }));
  }, [chaptersQuery]);

  // Transform characters (raw from Convex)
  const characters = useMemo<CharacterBundle[]>(() => {
    if (!charactersQuery) return [];
    return charactersQuery.map((c) => ({
      path: c.path,
      slug: c.slug,
      name: c.name,
      extra: c.extra as CharacterBundle["extra"],
      avatar: c.avatar,
      speaks: c.speaks,
      listens: c.listens,
    }));
  }, [charactersQuery]);

  // Transform backgrounds (raw from Convex)
  const backgrounds = useMemo<BackgroundInfo[]>(() => {
    if (!backgroundsQuery) return [];
    return backgroundsQuery.map((b) => ({
      path: b.path,
      basename: b.basename,
      url: b.url,
      chapter: b.chapter,
      paragraph: b.paragraph,
      backgroundColor: b.backgroundColor,
      textColor: b.textColor,
    }));
  }, [backgroundsQuery]);

  // Transform music (raw from Convex)
  const music = useMemo<MusicInfo[]>(() => {
    if (!musicQuery) return [];
    return musicQuery.map((m) => ({ path: m.path, basename: m.basename, url: m.url, chapter: m.chapter, paragraph: m.paragraph }));
  }, [musicQuery]);

  // Transform backgrounds to player format
  const backgroundsForBook = useMemo<BackgroundForBook[]>(() => {
    return backgrounds.filter((b) => b.url).map((b) => ({ chapter: b.chapter, paragraph: b.paragraph, file: b.url!, backgroundColor: b.backgroundColor, textColor: b.textColor }));
  }, [backgrounds]);

  // Transform music to player format
  const backgroundSongsForBook = useMemo<BackgroundSongSection[]>(() => {
    return music.filter((m) => m.url).map((m) => ({ chapter: m.chapter, paragraph: m.paragraph, files: [m.url!] }));
  }, [music]);

  // Derive known video files from characters
  const knownVideoFiles = useMemo<string[]>(() => {
    const videos: string[] = [];
    for (const char of characters) {
      const pattern = char.slug.toLowerCase().replace(/ /g, "-").replace(/"/g, "").replace(/[()]/g, "");
      if (char.speaks) videos.push(`${pattern}-speaks.mp4`);
      if (char.listens) videos.push(`${pattern}-listens.mp4`);
    }
    return videos;
  }, [characters]);

  // Transform book metadata to player format
  const bookData = useMemo<BookData | null>(() => {
    if (!book) return null;
    const extra = book.extra;

    return {
      slug: bookSlug,
      metadata: { title: book.name, author: extra.author, language: extra.language, bookForm: extra.form?.toLowerCase() },
      chapters: chaptersData,
      hasAudiobook: false,
    };
  }, [book, bookSlug, chaptersData]);

  // Compute chapter version signature for change detection
  const chapterVersionSignature = useMemo(() => {
    return chapters.map((c) => c.versionId).join("|");
  }, [chapters]);

  // Process chapters: fetch XMLs, convert to HTML, extract metadata
  const processChapters = useCallback(
    async (forceReprocess = false) => {
      if (chapters.length === 0) {
        console.log("[Convex:Flow] Skipping - no chapters");
        return;
      }

      // CRITICAL: Don't process without character data - results in broken HTML
      if (characters.length === 0) {
        console.log("[Convex:Flow] Skipping - no characters loaded yet");
        return;
      }

      // Check if chapters actually changed by comparing full signatures
      const prevSig = prevChapterVersionIdsRef.current;
      const newSig = chapterVersionSignature;
      const signaturesMatch = prevSig === newSig;
      const chaptersChanged = !signaturesMatch;

      console.log("[Convex:Flow] processChapters called", {
        chaptersChanged,
        signaturesMatch,
        forceReprocess,
        initialLoadComplete: initialLoadCompleteRef.current,
        prevSigLength: prevSig.length,
        newSigLength: newSig.length,
        prevSig: prevSig.length > 80 ? prevSig.slice(0, 40) + "..." + prevSig.slice(-40) : prevSig,
        newSig: newSig.length > 80 ? newSig.slice(0, 40) + "..." + newSig.slice(-40) : newSig,
      });

      if (!chaptersChanged && !forceReprocess && initialLoadCompleteRef.current) {
        console.log("[Convex:Flow] Skipping reprocess - signatures match");
        return;
      }

      // Also skip if we're already processing (use ref to avoid stale closure)
      if (isProcessingRef.current) {
        console.log("[Convex:Flow] Skipping - already processing");
        return;
      }

      console.log("[Convex:Flow] Starting chapter processing...", { chaptersCount: chapters.length, charactersCount: characters.length });
      isProcessingRef.current = true;
      setError(null);

      try {
        // Fetch XML content for each chapter (parallel, direct from R2 CDN)
        console.time("getChapterContent");
        const chapterContents = await Promise.all(
          chapters.map(async (chapter) => {
            if (!chapter.versionId) return null;
            // Pass URL for direct R2 fetch (faster), with versionId fallback
            return getChapterContent(chapter.versionId, chapter.url);
          }),
        );
        console.timeEnd("getChapterContent");
        // Filter nulls
        const validContents = chapterContents.filter((c): c is string => c !== null);

        if (validContents.length === 0) {
          setError("No chapter content available");
          isProcessingRef.current = false;
          return;
        }

        console.time("build");
        // Build set of known character slugs from Convex bundles (lowercase for matching)
        const knownCharacterSlugs = new Set<string>();
        for (const c of characters) {
          knownCharacterSlugs.add(c.slug.toLowerCase());
        }

        // Scan for character tags in XML - only include tags that match known characters
        const tempXml = `<Book>${validContents.join("\n")}</Book>`;
        const tempParser = new DOMParser();
        const tempDoc = tempParser.parseFromString(tempXml, "text/xml");

        const actualCharacterTags = new Set<string>();
        const chaptersElements = tempDoc.getElementsByTagName("Chapter");
        for (const chapterEl of Array.from(chaptersElements)) {
          const walker = document.createTreeWalker(chapterEl, NodeFilter.SHOW_ELEMENT);
          let node: Node | null = walker.currentNode;
          while (node) {
            if (node instanceof Element && knownCharacterSlugs.has(node.tagName.toLowerCase())) {
              actualCharacterTags.add(node.tagName);
            }
            node = walker.nextNode();
          }
        }

        // Combine chapters into full XML (no CharactersMaster - passed directly to processor)
        const combinedXml = `<Book>${validContents.join("\n")}</Book>`;

        // Get book form and language (required)
        const bookForm = book?.extra?.form?.toLowerCase() || "book";
        const bookLang = book?.extra?.language?.toLowerCase() || "english";
        // Convert character bundles to the format expected by xmlToComplexHtml and extractCharacterMetadata
        const characterBundles = characters.map((c) => ({ slug: c.slug, name: c.name, extra: c.extra, avatar: c.avatar, listens: c.listens, speaks: c.speaks }));

        // Process XML to HTML - pass character bundles directly (no XML serialization)
        const { htmlResult, chapterTitles } = xmlToComplexHtml(combinedXml, bookSlug, bookLang, characterBundles, bookForm);

        setBookStringified(htmlResult);
        setChaptersData(chapterTitles.map((ct) => ({ id: ct.id, title: ct.title })));

        // Build character metadata directly from Convex bundles + chapter scanning
        // This replaces the old CharactersMaster XML extraction
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(combinedXml, "text/xml");

        // Extract character metadata with display names and summaries from Convex bundles
        const charMetadata = extractCharacterMetadata(xmlDoc, actualCharacterTags, bookForm, bookSlug, characterBundles);
        setCharactersData(charMetadata);

        // Update tracking
        prevChapterVersionIdsRef.current = chapterVersionSignature;
        initialLoadCompleteRef.current = true;

        // Increment version on chapter changes
        if (chaptersChanged) {
          setTextVersion((v) => {
            console.log("[Convex:Flow] Incrementing textVersion", v, "->", v + 1);
            return v + 1;
          });
        }
        console.timeEnd("build");

        console.log("[Convex:Flow] Chapter processing complete");
        isProcessingRef.current = false;
      } catch (e) {
        console.error("[BookConvexContext] Failed to process chapters:", e);
        setError(e instanceof Error ? e.message : "Failed to process book content");
        isProcessingRef.current = false;
      }
    },
    [chapters, characters, chapterVersionSignature, book, bookSlug, getChapterContent],
  );

  // Reload function
  const reloadChapters = useCallback(async () => {
    // Clear cache and reset tracking
    chapterContentCache.current.clear();
    prevChapterVersionIdsRef.current = "";
    await processChapters(true);
  }, [processChapters]);

  // Process chapters when queries complete
  // NOTE: processChapters is intentionally NOT in the dependency array to prevent
  // infinite loops. The function checks chapterVersionSignature internally.
  useEffect(() => {
    if (chaptersQuery !== undefined && bookMetadata !== undefined && charactersQuery !== undefined) {
      void processChapters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaptersQuery, bookMetadata, charactersQuery, chapterVersionSignature]);

  // Sync character metadata when Convex character bundles change (name/summary edits)
  // This is separate from chapter processing - allows character edits to update instantly
  // without reprocessing chapter HTML
  useEffect(() => {
    if (!characters.length || !initialLoadCompleteRef.current) return;

    // Update charactersData with fresh displayName and summary from Convex bundles
    // Keep existing infoPerChapter structure (from chapter scanning), just refresh the data
    setCharactersData((prev) => {
      if (prev.length === 0) return prev;

      return prev.map((char) => {
        // Case-insensitive slug matching (XML uses PascalCase, Convex uses lowercase)
        const bundle = characters.find((c) => c.slug.toLowerCase() === char.slug.toLowerCase());
        if (!bundle) return char;

        const newSummary = bundle.extra.summary ?? "";

        return {
          ...char,
          characterName: bundle.extra.displayName ?? bundle.name,
          // Update summary in each chapter's info
          infoPerChapter: char.infoPerChapter.map((chapterInfo) => ({ ...chapterInfo, summary: newSummary })),
          // Update media URLs from Convex bundles
          media: { avatarUrl: bundle.avatar?.url, listensUrl: bundle.listens?.url, speaksUrl: bundle.speaks?.url },
        };
      });
    });
  }, [characters]);

  // Populate URL registries for CharacterMedia and normalizeSrcForInlineAvatar
  useEffect(() => {
    if (!characters.length) return;

    // Build listens → speaks URL mapping
    const listensToSpeaks = new Map<string, string>();
    // Build video → avatar URL mapping
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

  // Compute loading state
  const isLoading = bookMetadata === undefined || chaptersQuery === undefined || charactersQuery === undefined || backgroundsQuery === undefined || musicQuery === undefined;

  // Ready when initial load complete - don't go back to "not ready" during updates
  // Once we have content, we stay "ready" even while processing updates in the background
  const isReady = !isLoading && bookStringified !== null && initialLoadCompleteRef.current;

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
    ],
  );

  // Sync to global store for non-React code
  // Using useLayoutEffect so store is updated BEFORE other effects run
  // This prevents race conditions where effects read stale store data
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

  // Clear store on unmount
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

/**
 * Get all book data from Convex.
 */
export function useBookConvex() {
  return useContext(BookConvexContext);
}

/**
 * Get character context as a Map for quick lookup.
 * Used by chapter processing for character info.
 */
export function useCharacterMap() {
  const { characters } = useBookConvex();

  return useMemo(() => {
    const map = new Map<string, CharacterBundle>();
    for (const char of characters) {
      // Index by lowercase slug for case-insensitive lookup
      map.set(char.slug.toLowerCase(), char);
      // Also index by name if different
      if (char.name && char.name.toLowerCase() !== char.slug.toLowerCase()) {
        map.set(char.name.toLowerCase(), char);
      }
    }
    return map;
  }, [characters]);
}
