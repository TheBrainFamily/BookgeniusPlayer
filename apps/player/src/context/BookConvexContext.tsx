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
import { detectSourceFormat, normalizeChapterHtml, extractCharacterOccurrences, type CharacterOccurrence } from "@player/services/htmlNormalizer";
import { setBookDataStore, clearBookDataStore, type Note, type Variant } from "@player/state/bookDataStore";
import { setListensToSpeaksUrls, setLiveAssetUrls } from "@player/utils/assetUrls";
import type { BackgroundForBook, BackgroundSongSection, CharacterData, CharacterMedia, BookData, Chapter as ChapterTitle } from "@player/types/book";
import { bookIndex } from "@player/logic/BookIndex";
import type { CharacterIndex, ChapterOccurrences, CompiledChapter } from "@convex/lib/characterDataV2";
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

/** Raw chapter data from Convex queries (listChapters / listChaptersWithDrafts) */
type ChapterQueryItem = { path: string; basename: string; versionId: string; chapterNumber: number; title?: string; url?: string; state?: string; hasDraft?: boolean };

/** Compiled chapter HTML data from Convex (listChapterHtml) */
type ChapterHtmlQueryItem = {
  path: string;
  basename: string;
  versionId: string;
  chapterNumber: number;
  title?: string;
  url?: string;
  contentType?: string;
  size?: number;
  publishedAt?: number;
  sourceVersionId?: string;
  paragraphCount?: number;
};

/** HTML source chapter data from Convex (listHtmlSourceChapters) */
type HtmlSourceChapterQueryItem = { basename: string; url: string; versionId: string; chapterNumber: number; title?: string; paragraphCount?: number; sourceFormat: string };

/** Per-chapter character data fragments (listCharacterDataFragments) */
type CharacterDataFragmentQueryItem = {
  path: string;
  basename: string;
  versionId: string;
  chapterNumber: number;
  url?: string;
  contentType?: string;
  size?: number;
  publishedAt?: number;
  sourceVersionId?: string;
};

type CharacterDataFragmentPayload = { chapterNumber: number; characters: CharacterData[] };

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
  return `\n      <section><section data-chapter="${chapterNumber}"></section></section>`;
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
    html = `\n    <div class="play-container">${html}\n    </div>`;
  } else if (form === "mixed") {
    html = `\n    <div class="play-container mixed-container">${html}\n    </div>`;
  }

  return `<section>${html.trim()}</section>`;
};

const parseCharacterFragmentPayload = (content: string, fallbackChapterNumber: number): CharacterDataFragmentPayload | null => {
  try {
    const parsed = JSON.parse(content) as CharacterDataFragmentPayload | CharacterData[] | null;
    if (Array.isArray(parsed)) {
      return { chapterNumber: fallbackChapterNumber, characters: parsed };
    }
    if (parsed && Array.isArray(parsed.characters)) {
      return { chapterNumber: parsed.chapterNumber ?? fallbackChapterNumber, characters: parsed.characters };
    }
  } catch (error) {
    console.warn("[BookConvexContext] Failed to parse character fragment", error);
  }
  return null;
};

const mergeCharacterDataFragments = (fragments: CharacterDataFragmentPayload[], bookSlug: string, mediaBySlug?: Map<string, CharacterMedia>): CharacterData[] => {
  const merged = new Map<string, CharacterData>();

  for (const fragment of fragments) {
    for (const character of fragment.characters) {
      const slugKey = character.slug.toLowerCase();
      const mediaOverride = mediaBySlug?.get(slugKey);
      const existing = merged.get(character.slug);
      const base: CharacterData = existing ?? {
        slug: character.slug,
        characterName: character.characterName,
        bookSlug: character.bookSlug || bookSlug,
        infoPerChapter: [],
        overrides: character.overrides,
        media: character.media,
      };

      const info = character.infoPerChapter ?? [];
      const nextInfo = [...base.infoPerChapter];
      for (const entry of info) {
        const idx = nextInfo.findIndex((i) => i.chapter === entry.chapter);
        if (idx >= 0) {
          nextInfo[idx] = entry;
        } else {
          nextInfo.push(entry);
        }
      }

      nextInfo.sort((a, b) => a.chapter - b.chapter);

      const mergedMedia = { ...character.media, ...base.media, ...mediaOverride };
      const hasMedia = Boolean(mergedMedia.avatarUrl || mergedMedia.listensUrl || mergedMedia.speaksUrl);

      merged.set(character.slug, {
        ...base,
        characterName: character.characterName || base.characterName,
        bookSlug: character.bookSlug || base.bookSlug,
        infoPerChapter: nextInfo,
        overrides: base.overrides ?? character.overrides,
        media: hasMedia ? mergedMedia : undefined,
      });
    }
  }

  return Array.from(merged.values());
};

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
  /** Ensure compiled chapter HTML is loaded for the given chapter numbers */
  ensureCompiledChaptersLoaded: (chapterNumbers: number[]) => Promise<void>;
  /** Prefetch compiled chapter HTML up to a chapter number */
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

  // State for processed content
  const [bookStringified, setBookStringified] = useState<string | null>(null);
  const [chaptersData, setChaptersData] = useState<ChapterTitle[]>([]);
  const [charactersData, setCharactersData] = useState<CharacterData[]>([]);
  const [textVersion, setTextVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Chapter content cache
  const chapterContentCache = useRef<Map<string, string>>(new Map());
  // Compiled chapter HTML cache (keyed by chapter number)
  const compiledHtmlCacheRef = useRef<Map<number, { versionId: string; html: string }>>(new Map());
  // Character fragment cache (keyed by chapter number)
  const characterFragmentCacheRef = useRef<Map<number, { versionId: string; payload: CharacterDataFragmentPayload }>>(new Map());

  // V2 format caches
  // V2 compiled chapter cache (stores full CompiledChapter with html + occurrences)
  const compiledV2CacheRef = useRef<Map<number, { versionId: string; data: CompiledChapter }>>(new Map());
  // V2 character index cache
  const characterIndexV2Ref = useRef<{ versionId: string; index: CharacterIndex } | null>(null);
  const htmlSourceCacheRef = useRef<Map<number, { versionId: string; html: string; occurrences: CharacterOccurrence[] }>>(new Map());

  // Track previous content signatures to detect actual changes
  const prevContentSignatureRef = useRef<string>("");
  const prevCharacterSignatureRef = useRef<string>("");
  const initialLoadCompleteRef = useRef(false);
  const isProcessingRef = useRef(false);
  const lastRequestedCompiledChaptersRef = useRef<number[]>([]);
  const lastRequestedCharacterChaptersRef = useRef<number[]>([]);

  // Extract book slug from path
  const bookSlug = useMemo(() => bookPath.split("/").pop() || "", [bookPath]);

  // Feature flag: use V2 format (combined HTML + occurrences)
  const useV2Format = true;

  // All queries run in parallel (Convex optimizes this)
  const bookMetadata = useQuery(api.bookQueries.getBookMetadata, { bookPath });

  // Use draft-aware or published-only queries based on draftMode
  const chaptersQuery = useQuery(draftMode ? api.bookQueries.listChaptersWithDrafts : api.bookQueries.listChapters, { bookPath }) as ChapterQueryItem[] | undefined;

  const compiledChaptersV2Query = useQuery(api.bookQueries.listCompiledChapters, useV2Format ? { bookPath } : "skip");
  const characterIndexV2Query = useQuery(api.bookQueries.getCharacterIndexV2, useV2Format ? { bookPath } : "skip");
  const htmlSourceChaptersQuery = useQuery(api.bookQueries.listHtmlSourceChapters, !draftMode ? { bookPath } : "skip") as HtmlSourceChapterQueryItem[] | null | undefined;

  const characterDataFragmentsQuery = useQuery(api.bookQueries.listCharacterDataFragments, useV2Format ? "skip" : { bookPath }) as CharacterDataFragmentQueryItem[] | undefined;

  //TODO character always use drafts
  const charactersQuery = useQuery(api.bookQueries.listCharacterBundlesWithDrafts, { bookPath });

  // Use new cue-based queries (supports video/music reuse across chapters)
  const backgroundsQuery = useQuery(draftMode ? api.backgroundCues.listForPlayerWithDrafts : api.backgroundCues.listForPlayer, { bookPath });

  const musicQuery = useQuery(draftMode ? api.musicCues.listForPlayerWithDrafts : api.musicCues.listForPlayer, { bookPath });

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

  // Transform chapters (raw from Convex) - fallback to HTML source if no XML chapters
  const chapters = useMemo<ChapterInfo[]>(() => {
    if (chaptersQuery && chaptersQuery.length > 0) {
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
    }
    if (htmlSourceChaptersQuery && htmlSourceChaptersQuery.length > 0) {
      return htmlSourceChaptersQuery.map((c) => ({
        path: "",
        basename: c.basename,
        versionId: c.versionId,
        chapterNumber: c.chapterNumber,
        title: c.title ?? undefined,
        url: c.url,
        state: "published" as const,
        hasDraft: false,
      }));
    }
    return [];
  }, [chaptersQuery, htmlSourceChaptersQuery]);

  const chapterOrder = useMemo(() => chapters.map((c) => c.chapterNumber), [chapters]);

  const htmlSourceByNumber = useMemo(() => {
    if (!htmlSourceChaptersQuery) return new Map<number, HtmlSourceChapterQueryItem>();
    return new Map(htmlSourceChaptersQuery.map((c) => [c.chapterNumber, c]));
  }, [htmlSourceChaptersQuery]);

  const chapterStructure = useMemo(
    () => chapters.map((chapter) => ({ chapterNumber: chapter.chapterNumber, paragraphCount: htmlSourceByNumber.get(chapter.chapterNumber)?.paragraphCount ?? 0 })),
    [chapters, htmlSourceByNumber],
  );

  const characterDataFragments = useMemo<CharacterDataFragmentQueryItem[]>(() => characterDataFragmentsQuery ?? [], [characterDataFragmentsQuery]);
  const characterFragmentsByNumber = useMemo(() => new Map(characterDataFragments.map((c) => [c.chapterNumber, c])), [characterDataFragments]);
  const characterFragmentsOrdered = useMemo(() => {
    if (chapters.length === 0) return [];
    return chapters.map((c) => characterFragmentsByNumber.get(c.chapterNumber)).filter((c): c is CharacterDataFragmentQueryItem => Boolean(c));
  }, [chapters, characterFragmentsByNumber]);

  useEffect(() => {
    if (draftMode || chapterStructure.length === 0) return;
    bookIndex.setParagraphCountOverrides(chapterStructure);
    const totalParagraphs = chapterStructure.reduce((sum, entry) => sum + entry.paragraphCount, 0);
    const missing = chapterStructure.filter((entry) => entry.paragraphCount <= 0).map((entry) => entry.chapterNumber);
    console.log("[BookProgress] paragraph overrides", { chapters: chapterStructure.length, totalParagraphs, missingCount: missing.length, missingSample: missing.slice(0, 5) });
  }, [draftMode, chapterStructure]);

  // Transform characters (raw from Convex)
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

  // Transform backgrounds (from cue-based queries)
  // New query format: { startChapter, startParagraph, file, url, backgroundColor, textColor }
  const backgrounds = useMemo<BackgroundInfo[]>(() => {
    if (!backgroundsQuery) return [];
    return backgroundsQuery.map((b) => ({
      path: "", // Not available in cue format
      basename: b.file,
      url: b.url,
      chapter: b.startChapter,
      paragraph: b.startParagraph,
      backgroundColor: b.backgroundColor,
      textColor: b.textColor,
    }));
  }, [backgroundsQuery]);

  // Transform music (from cue-based queries)
  // New query format: { chapter, paragraph, files }
  const music = useMemo<MusicInfo[]>(() => {
    if (!musicQuery) return [];
    return musicQuery.map((m) => ({
      path: "", // Not available in cue format
      basename: m.files[0]?.split("/").pop() ?? "",
      url: m.files[0],
      chapter: m.chapter,
      paragraph: m.paragraph,
    }));
  }, [musicQuery]);

  // Transform backgrounds to player format
  // Cue queries already return player-compatible format
  const backgroundsForBook = useMemo<BackgroundForBook[]>(() => {
    if (!backgroundsQuery) return [];
    return backgroundsQuery
      .filter((b) => b.url)
      .map((b) => ({ chapter: b.startChapter, paragraph: b.startParagraph, file: b.url!, backgroundColor: b.backgroundColor, textColor: b.textColor }));
  }, [backgroundsQuery]);

  // Transform music to player format
  // Cue queries already return player-compatible format
  const backgroundSongsForBook = useMemo<BackgroundSongSection[]>(() => {
    if (!musicQuery) return [];
    return musicQuery.filter((m) => m.files.length > 0 && m.files[0]);
  }, [musicQuery]);

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

  // Compute content signatures for change detection
  const xmlChapterSignature = useMemo(() => {
    return chapters.map((c) => c.versionId).join("|");
  }, [chapters]);

  const characterFragmentsReady = !draftMode && chapters.length > 0 && characterFragmentsOrdered.length === chapters.length;

  const htmlSourceAvailable = !draftMode && htmlSourceChaptersQuery !== null && htmlSourceChaptersQuery !== undefined && htmlSourceChaptersQuery.length > 0;

  const v2Available = useV2Format && !draftMode && !htmlSourceAvailable && compiledChaptersV2Query !== null && characterIndexV2Query !== null;
  const compiledV2ByNumber = useMemo(() => {
    if (!compiledChaptersV2Query) return new Map<number, { url: string; versionId: string }>();
    return new Map(compiledChaptersV2Query.map((c) => [c.chapterNumber, { url: c.url, versionId: c.versionId }]));
  }, [compiledChaptersV2Query]);

  const chapterOrderSet = useMemo(() => new Set(chapterOrder), [chapterOrder]);

  const getChaptersUpTo = useCallback(
    (endChapter: number): number[] => {
      if (chapterOrder.length === 0) return [];
      return chapterOrder.filter((chapterNumber) => chapterNumber <= endChapter);
    },
    [chapterOrder],
  );

  const normalizeRequestedChapters = useCallback(
    (chapterNumbers: number[]): number[] => {
      if (chapterNumbers.length === 0 || chapterOrderSet.size === 0) return [];
      const unique = Array.from(new Set(chapterNumbers)).filter((chapterNumber) => chapterOrderSet.has(chapterNumber));
      unique.sort((a, b) => a - b);
      return unique;
    },
    [chapterOrderSet],
  );

  const buildCompiledChapterEntries = useCallback((): ChapterHtmlEntry[] => {
    return chapterOrder.map((chapterNumber) => {
      const cached = compiledHtmlCacheRef.current.get(chapterNumber);
      return { chapterNumber, html: cached?.html };
    });
  }, [chapterOrder]);

  const buildCompiledSignature = useCallback((): string => {
    if (chapterOrder.length === 0) return "";
    return chapterOrder.map((chapterNumber) => compiledHtmlCacheRef.current.get(chapterNumber)?.versionId ?? "missing").join("|");
  }, [chapterOrder]);

  const buildCharacterSignature = useCallback((): string => {
    if (chapterOrder.length === 0) return "";
    return chapterOrder.map((chapterNumber) => characterFragmentCacheRef.current.get(chapterNumber)?.versionId ?? "missing").join("|");
  }, [chapterOrder]);

  const buildV2Signature = useCallback((): string => {
    if (chapterOrder.length === 0) return "";
    const chapterSig = chapterOrder.map((n) => compiledV2CacheRef.current.get(n)?.versionId ?? "missing").join("|");
    const indexSig = characterIndexV2Ref.current?.versionId ?? "missing";
    return `${indexSig}:${chapterSig}`;
  }, [chapterOrder]);

  const buildV2ChapterEntries = useCallback((): ChapterHtmlEntry[] => {
    return chapterOrder.map((chapterNumber) => {
      const cached = compiledV2CacheRef.current.get(chapterNumber);
      return { chapterNumber, html: cached?.data.html };
    });
  }, [chapterOrder]);

  const updateFromV2Cache = useCallback(() => {
    throw new Error("[DEPRECATED] updateFromV2Cache should not be called - use HTML source format instead");
  }, []);

  const buildHtmlSourceSignature = useCallback((): string => {
    if (chapterOrder.length === 0) return "";
    const chapterSig = chapterOrder.map((n) => htmlSourceCacheRef.current.get(n)?.versionId ?? "missing").join("|");
    const characterCount = characters.length;
    return `${chapterSig}:chars=${characterCount}`;
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
    console.log(`[Convex:Flow:HtmlSource] Setting charactersData: ${merged.length} characters from ${characters.length} bundles`);
    setCharactersData(merged);

    prevContentSignatureRef.current = signature;
    prevCharacterSignatureRef.current = signature;

    if (!initialLoadCompleteRef.current) {
      initialLoadCompleteRef.current = true;
    }

    setTextVersion((v) => {
      console.log("[Convex:Flow:HtmlSource] Incrementing textVersion", v, "->", v + 1);
      return v + 1;
    });
  }, [book, bookSlug, bookStringified, buildHtmlSourceChapterEntries, buildHtmlSourceSignature, characters]);

  const updateCompiledBookHtml = useCallback(() => {
    throw new Error("[DEPRECATED] updateCompiledBookHtml should not be called - use HTML source format instead");
  }, []);

  const updateCharactersFromCache = useCallback(() => {
    throw new Error("[DEPRECATED] updateCharactersFromCache should not be called - use HTML source format instead");
  }, []);

  const ensureCompiledChaptersLoadedV1 = useCallback(async (_chapterNumbers: number[]) => {
    throw new Error("[DEPRECATED] ensureCompiledChaptersLoadedV1 should not be called - use HTML source format instead");
  }, []);

  const ensureCharacterFragmentsLoaded = useCallback(async (_chapterNumbers: number[]) => {
    throw new Error("[DEPRECATED] ensureCharacterFragmentsLoaded should not be called - use HTML source format instead");
  }, []);

  const ensureCharacterIndexV2Loaded = useCallback(async () => {
    throw new Error("[DEPRECATED] ensureCharacterIndexV2Loaded should not be called - use HTML source format instead");
  }, []);

  const ensureCompiledChaptersLoadedV2 = useCallback(async (_chapterNumbers: number[]) => {
    throw new Error("[DEPRECATED] ensureCompiledChaptersLoadedV2 should not be called - use HTML source format instead");
  }, []);

  const ensureHtmlSourceChaptersLoaded = useCallback(
    async (chapterNumbers: number[]) => {
      if (!htmlSourceAvailable) return;

      const requested = normalizeRequestedChapters(chapterNumbers);
      if (requested.length === 0) return;

      lastRequestedCompiledChaptersRef.current = requested;
      lastRequestedCharacterChaptersRef.current = requested;

      const toFetch = requested.filter((chapterNumber) => {
        const entry = htmlSourceByNumber.get(chapterNumber);
        if (!entry?.versionId) return false;
        const cached = htmlSourceCacheRef.current.get(chapterNumber);
        return !cached || cached.versionId !== entry.versionId;
      });

      if (toFetch.length > 0) {
        setError(null);
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
          setError("No HTML source chapters available");
          return;
        }

        for (const result of successful) {
          htmlSourceCacheRef.current.set(result.chapterNumber, { versionId: result.versionId, html: result.html, occurrences: result.occurrences });
        }
      }

      updateFromHtmlSourceCache();
    },
    [htmlSourceAvailable, htmlSourceByNumber, normalizeRequestedChapters, updateFromHtmlSourceCache],
  );

  const ensureCompiledChaptersLoaded = useCallback(
    async (chapterNumbers: number[]) => {
      if (!htmlSourceAvailable) return;
      await ensureHtmlSourceChaptersLoaded(chapterNumbers);
    },
    [ensureHtmlSourceChaptersLoaded, htmlSourceAvailable],
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

  const prefetchCharacterFragmentsUpTo = useCallback(
    async (chapterNumber: number) => {
      if (chapterNumber <= 0) return;
      const chaptersToFetch = getChaptersUpTo(chapterNumber);
      if (chaptersToFetch.length === 0) return;
      if (htmlSourceAvailable || v2Available) {
        await ensureCompiledChaptersLoaded(chaptersToFetch);
      } else {
        await ensureCharacterFragmentsLoaded(chaptersToFetch);
      }
    },
    [ensureCharacterFragmentsLoaded, ensureCompiledChaptersLoaded, getChaptersUpTo, htmlSourceAvailable, v2Available],
  );

  // Process chapters from XML (draft mode or fallback)
  const processChaptersFromXml = useCallback(
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
      const prevSig = prevContentSignatureRef.current;
      const newSig = xmlChapterSignature;
      const signaturesMatch = prevSig === newSig;
      const chaptersChanged = !signaturesMatch;

      console.log("[Convex:Flow] processChaptersFromXml called", {
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
        prevContentSignatureRef.current = xmlChapterSignature;
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
    [chapters, characters, xmlChapterSignature, book, bookSlug, getChapterContent],
  );

  const reloadChapters = useCallback(async () => {
    chapterContentCache.current.clear();
    compiledHtmlCacheRef.current.clear();
    characterFragmentCacheRef.current.clear();
    compiledV2CacheRef.current.clear();
    characterIndexV2Ref.current = null;
    htmlSourceCacheRef.current.clear();
    prevContentSignatureRef.current = "";
    prevCharacterSignatureRef.current = "";

    if (!draftMode && (htmlSourceAvailable || v2Available)) {
      if (lastRequestedCompiledChaptersRef.current.length > 0) {
        await ensureCompiledChaptersLoaded(lastRequestedCompiledChaptersRef.current);
      }
      if (!v2Available && lastRequestedCharacterChaptersRef.current.length > 0) {
        await ensureCharacterFragmentsLoaded(lastRequestedCharacterChaptersRef.current);
      }
      return;
    }

    await processChaptersFromXml(true);
  }, [draftMode, ensureCompiledChaptersLoaded, ensureCharacterFragmentsLoaded, htmlSourceAvailable, processChaptersFromXml, v2Available]);

  useEffect(() => {
    chapterContentCache.current.clear();
    compiledHtmlCacheRef.current.clear();
    characterFragmentCacheRef.current.clear();
    compiledV2CacheRef.current.clear();
    characterIndexV2Ref.current = null;
    htmlSourceCacheRef.current.clear();
    prevContentSignatureRef.current = "";
    prevCharacterSignatureRef.current = "";
    initialLoadCompleteRef.current = false;
    lastRequestedCompiledChaptersRef.current = [];
    lastRequestedCharacterChaptersRef.current = [];
    setBookStringified(null);
    setChaptersData([]);
    setCharactersData([]);
  }, [draftMode, bookPath]);

  useEffect(() => {
    if (chaptersQuery === undefined || bookMetadata === undefined || charactersQuery === undefined) {
      return;
    }

    if (htmlSourceAvailable || v2Available) {
      return;
    }

    if (!draftMode && characterDataFragmentsQuery === undefined) {
      return;
    }

    void processChaptersFromXml();
  }, [chaptersQuery, bookMetadata, charactersQuery, xmlChapterSignature, draftMode, characterDataFragmentsQuery, htmlSourceAvailable, processChaptersFromXml, v2Available]);

  useEffect(() => {
    if (draftMode) return;
    if (htmlSourceAvailable) {
      if (chapters.length === 0 || !htmlSourceChaptersQuery) {
        setChaptersData([]);
        return;
      }
      const titleMap = new Map(htmlSourceChaptersQuery.map((c) => [c.chapterNumber, c.title]));
      const chapterTitleFallback = new Map(chapters.map((c) => [c.chapterNumber, c.title]));
      setChaptersData(chapterOrder.map((chapterNumber) => ({ id: String(chapterNumber), title: titleMap.get(chapterNumber) ?? chapterTitleFallback.get(chapterNumber) ?? "" })));
      return;
    }
    if (v2Available) {
      if (chapters.length === 0 || !compiledChaptersV2Query) {
        setChaptersData([]);
        return;
      }
      const v2TitleMap = new Map(compiledChaptersV2Query.map((c) => [c.chapterNumber, c.title]));
      const chapterTitleFallback = new Map(chapters.map((c) => [c.chapterNumber, c.title]));
      setChaptersData(chapterOrder.map((chapterNumber) => ({ id: String(chapterNumber), title: v2TitleMap.get(chapterNumber) ?? chapterTitleFallback.get(chapterNumber) ?? "" })));
      return;
    }
    if (chapters.length === 0) {
      setChaptersData([]);
      return;
    }

    const chapterTitleFallback = new Map(chapters.map((c) => [c.chapterNumber, c.title]));
    setChaptersData(chapterOrder.map((chapterNumber) => ({ id: String(chapterNumber), title: chapterTitleFallback.get(chapterNumber) ?? "" })));
  }, [draftMode, chapters, chapterOrder, htmlSourceAvailable, htmlSourceChaptersQuery, v2Available, compiledChaptersV2Query]);

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

  const isLoading =
    bookMetadata === undefined ||
    chaptersQuery === undefined ||
    charactersQuery === undefined ||
    backgroundsQuery === undefined ||
    musicQuery === undefined ||
    (!draftMode && htmlSourceChaptersQuery === undefined) ||
    (!draftMode &&
      !htmlSourceAvailable &&
      (useV2Format ? compiledChaptersV2Query === undefined || characterIndexV2Query === undefined : characterDataFragmentsQuery === undefined));

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
      ensureCompiledChaptersLoaded,
      ensureCharacterFragmentsLoaded,
      prefetchChaptersUpTo,
      prefetchCharacterFragmentsUpTo,
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
      ensureCharacterFragmentsLoaded,
      prefetchChaptersUpTo,
      prefetchCharacterFragmentsUpTo,
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
