/**
 * LiveBookDataContext - Reactive book data loading from Convex CMS.
 *
 * This context provides the same data shape as the static book data loaders,
 * but fetches everything from Convex with draft-awareness for live preview.
 *
 * When a chapter is edited in the CMS, the player updates automatically
 * thanks to Convex's reactive queries.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { xmlToComplexHtml } from "@player/services/live/xmlProcessor";
import { extractCharacterMetadata, getCharacterTags, getCharacterOverrides } from "@player/services/live/characterExtractor";
import type { BackgroundForBook, BackgroundSongSection, CharacterData, BookData, Chapter } from "@player/types/book";

// =============================================================================
// Types
// =============================================================================

/** Character bundle from Convex with media URLs */
interface CharacterBundle {
  slug: string;
  name: string;
  avatar?: { url: string };
  speaks?: { url: string };
  listens?: { url: string };
}

interface LiveBookDataContextType {
  /** Whether data is still loading */
  isLoading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Processed HTML content (from xmlToComplexHtml) */
  bookStringified: string | null;
  /** Chapter titles */
  chapters: Chapter[];
  /** Background positions with URLs */
  backgroundsForBook: BackgroundForBook[];
  /** Music positions with file arrays */
  backgroundSongsForBook: BackgroundSongSection[];
  /** Character metadata with appearance info */
  charactersData: CharacterData[];
  /** Book metadata */
  bookData: BookData | null;
  /** Version counter for reactivity (increments when content changes) */
  textVersion: number;
  /** Reload book data manually */
  reloadText: () => Promise<void>;
  /** Whether in editor mode */
  isEditorMode: boolean;
  /** Character bundles with media URLs from Convex */
  characterBundles: CharacterBundle[];
}

const defaultContext: LiveBookDataContextType = {
  isLoading: true,
  error: null,
  bookStringified: null,
  chapters: [],
  backgroundsForBook: [],
  backgroundSongsForBook: [],
  charactersData: [],
  bookData: null,
  textVersion: 0,
  reloadText: async () => {},
  isEditorMode: true, // Live mode is always editor mode
  characterBundles: [],
};

const LiveBookDataContext = createContext<LiveBookDataContextType>(defaultContext);

// =============================================================================
// Provider
// =============================================================================

interface LiveBookDataProviderProps {
  bookPath: string;
  children: React.ReactNode;
}

export function LiveBookDataProvider({ bookPath, children }: LiveBookDataProviderProps) {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookStringified, setBookStringified] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [charactersData, setCharactersData] = useState<CharacterData[]>([]);
  const [textVersion, setTextVersion] = useState(0);

  // Track previous chapter versionIds to detect actual content changes
  const prevChapterVersionIdsRef = useRef<string>("");
  // Track if initial load is complete
  const initialLoadCompleteRef = useRef(false);

  // Extract book slug from path (e.g., "books/1984-English" -> "1984-English")
  const bookSlug = useMemo(() => bookPath.split("/").pop() || "", [bookPath]);

  // Convex queries (reactive!)
  const bookMetadata = useQuery(api.bookQueries.getBookMetadata, { bookPath });
  const chaptersQuery = useQuery(api.bookQueries.listChaptersWithDrafts, { bookPath });
  const backgroundsQuery = useQuery(api.bookQueries.listBackgroundsWithDrafts, { bookPath });
  const musicQuery = useQuery(api.bookQueries.listMusicWithDrafts, { bookPath });
  const characterBundles = useQuery(api.bookQueries.listCharacterBundlesWithDrafts, { bookPath });

  // Action for fetching text content (bypasses CORS)
  const getTextContent = useAction(api.cli.getTextContent);

  // Transform backgrounds to player format
  const backgroundsForBook = useMemo<BackgroundForBook[]>(() => {
    if (!backgroundsQuery) return [];
    return backgroundsQuery
      .filter((b) => b.url)
      .map((b) => ({ chapter: b.chapter, paragraph: b.paragraph, file: b.url!, backgroundColor: b.backgroundColor, textColor: b.textColor }));
  }, [backgroundsQuery]);

  // Transform music to player format
  const backgroundSongsForBook = useMemo<BackgroundSongSection[]>(() => {
    if (!musicQuery) return [];
    return musicQuery.filter((m) => m.url).map((m) => ({ chapter: m.chapter, paragraph: m.paragraph, files: [m.url!] }));
  }, [musicQuery]);

  // Transform book metadata to player format
  const bookData = useMemo<BookData | null>(() => {
    if (!bookMetadata) return null;
    const extra = bookMetadata.extra as { language?: string; form?: string; author?: string } | undefined;

    return {
      slug: bookSlug,
      metadata: { title: bookMetadata.name, author: extra?.author || "Unknown", language: extra?.language || "english", bookForm: extra?.form || "prose" },
      chapters: chapters,
      hasAudiobook: false, // Live mode doesn't support audiobook yet
    };
  }, [bookMetadata, bookSlug, chapters]);

  // Ref to access characterBundles without adding to dependencies
  const characterBundlesRef = useRef(characterBundles);
  characterBundlesRef.current = characterBundles;

  // Compute a signature of chapter versionIds to detect content changes
  const chapterVersionSignature = useMemo(() => {
    if (!chaptersQuery) return "";
    return chaptersQuery.map((c) => c.versionId || "").join("|");
  }, [chaptersQuery]);

  // Fetch and process chapter XMLs - only runs when chapter content actually changes
  const processChapters = useCallback(
    async (forceReprocess = false) => {
      if (!chaptersQuery || chaptersQuery.length === 0) {
        setIsLoading(false);
        return;
      }

      // Check if chapters actually changed (skip if only character data changed)
      const chaptersChanged = chapterVersionSignature !== prevChapterVersionIdsRef.current;
      if (!chaptersChanged && !forceReprocess && initialLoadCompleteRef.current) {
        console.log("[LiveMode] Skipping chapter reprocess - only character data changed");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Fetch XML content for each chapter
        const chapterContents = await Promise.all(
          chaptersQuery.map(async (chapter) => {
            if (!chapter.versionId) return null;
            try {
              const result = await getTextContent({ versionId: chapter.versionId });
              return result?.content || null;
            } catch (e) {
              console.error(`Failed to fetch chapter ${chapter.basename}:`, e);
              return null;
            }
          }),
        );

        // Filter out nulls and concatenate XMLs
        const validContents = chapterContents.filter((c): c is string => c !== null);

        if (validContents.length === 0) {
          setError("No chapter content available");
          setIsLoading(false);
          return;
        }

        // First, scan chapters for actual character tags (elements starting with uppercase)
        // This ensures we use the correct case from the XML content
        const tempXml = `<Book>${validContents.join("\n")}</Book>`;
        const tempParser = new DOMParser();
        const tempDoc = tempParser.parseFromString(tempXml, "text/xml");

        const isLikelyCharacterTag = (tag: string) => {
          const first = tag.charAt(0);
          return first === first.toUpperCase() && /[A-Z]/.test(first);
        };

        // Collect all unique character-like tags from chapter content
        const actualCharacterTags = new Set<string>();
        const chapters = tempDoc.getElementsByTagName("Chapter");
        for (const chapter of Array.from(chapters)) {
          const walker = document.createTreeWalker(chapter, NodeFilter.SHOW_ELEMENT);
          let node: Node | null = walker.currentNode;
          while (node) {
            if (node instanceof Element && isLikelyCharacterTag(node.tagName)) {
              actualCharacterTags.add(node.tagName);
            }
            node = walker.nextNode();
          }
        }

        // Build a lookup from lowercase to actual bundle data (use ref to avoid dependency)
        const currentBundles = characterBundlesRef.current;
        const bundleLookup = new Map<string, { display: string; summary: string }>();
        if (currentBundles) {
          for (const bundle of currentBundles) {
            const extra = bundle.extra as { summary?: string; display?: string } | undefined;
            bundleLookup.set(bundle.slug.toLowerCase(), { display: extra?.display || bundle.name || bundle.slug, summary: extra?.summary || "" });
          }
        }

        // Build CharactersMaster using actual tags from content, augmented with bundle data
        const escapeXml = (str: string) => str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        let charactersMasterXml = "";
        if (actualCharacterTags.size > 0) {
          const characterElements = Array.from(actualCharacterTags).map((tag) => {
            const bundleData = bundleLookup.get(tag.toLowerCase());
            const display = escapeXml(bundleData?.display || tag);
            const summary = escapeXml(bundleData?.summary || "");
            return `<${tag} display="${display}" summary="${summary}"/>`;
          });
          charactersMasterXml = `<CharactersMaster>${characterElements.join("")}</CharactersMaster>`;
        }

        // Wrap in Book root element with CharactersMaster
        const combinedXml = `<Book>${charactersMasterXml}${validContents.join("\n")}</Book>`;

        // Get book form from metadata
        const bookForm = (bookMetadata?.extra as { form?: string })?.form || "prose";
        const bookLang = (bookMetadata?.extra as { language?: string })?.language || "english";

        // Process XML to HTML
        const { htmlResult, chapterTitles } = xmlToComplexHtml(combinedXml, bookSlug, bookLang);

        setBookStringified(htmlResult);
        setChapters(chapterTitles.map((ct) => ({ id: ct.id, title: ct.title })));

        // Extract character metadata from XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(combinedXml, "text/xml");
        const charTags = getCharacterTags(xmlDoc);
        const charOverrides = getCharacterOverrides(xmlDoc);
        const charMetadata = extractCharacterMetadata(xmlDoc, charTags, bookForm, bookSlug, charOverrides);
        setCharactersData(charMetadata);

        // Update tracking refs
        prevChapterVersionIdsRef.current = chapterVersionSignature;
        initialLoadCompleteRef.current = true;

        // Only increment textVersion if chapters actually changed (triggers remount)
        if (chaptersChanged || !initialLoadCompleteRef.current) {
          setTextVersion((v) => v + 1);
        }
        setIsLoading(false);
      } catch (e) {
        console.error("Failed to process chapters:", e);
        setError(e instanceof Error ? e.message : "Failed to process book content");
        setIsLoading(false);
      }
    },
    [chaptersQuery, bookMetadata, bookSlug, getTextContent, chapterVersionSignature],
  );

  // Reload function for manual refresh
  const reloadText = useCallback(async () => {
    await processChapters();
  }, [processChapters]);

  // Process chapters when query results change
  useEffect(() => {
    if (chaptersQuery !== undefined) {
      processChapters();
    }
  }, [chaptersQuery, processChapters]);

  // Handle character bundle updates separately (without full remount)
  // This updates avatars/videos/summaries in the caches without reprocessing book HTML
  useEffect(() => {
    // Skip if initial load isn't complete yet
    if (!initialLoadCompleteRef.current || !characterBundles) {
      return;
    }

    console.log("[LiveMode] Character bundles changed - updating caches without remount");

    // Update the character bundles in the injector caches
    // This allows avatars/videos to update without reloading the book
    import("@player/services/live/liveDataInjector").then(({ updateCharacterBundles }) => {
      updateCharacterBundles(characterBundles.map((b) => ({ slug: b.slug, name: b.name, avatar: b.avatar, speaks: b.speaks, listens: b.listens })));
    });
  }, [characterBundles]);

  // Context value
  // Transform character bundles to the expected format
  const transformedBundles = useMemo<CharacterBundle[]>(() => {
    if (!characterBundles) return [];
    return characterBundles.map((b) => ({ slug: b.slug, name: b.name, avatar: b.avatar, speaks: b.speaks, listens: b.listens }));
  }, [characterBundles]);

  const value = useMemo<LiveBookDataContextType>(
    () => ({
      isLoading,
      error,
      bookStringified,
      chapters,
      backgroundsForBook,
      backgroundSongsForBook,
      charactersData,
      bookData,
      textVersion,
      reloadText,
      isEditorMode: true,
      characterBundles: transformedBundles,
    }),
    [isLoading, error, bookStringified, chapters, backgroundsForBook, backgroundSongsForBook, charactersData, bookData, textVersion, reloadText, transformedBundles],
  );

  return <LiveBookDataContext.Provider value={value}>{children}</LiveBookDataContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

export function useLiveBookData() {
  return useContext(LiveBookDataContext);
}

// =============================================================================
// Compatibility Layer
// =============================================================================

/**
 * Create getters that match the existing book data loader interface.
 * This allows gradual migration of components without changing their code.
 */
export function createLiveDataGetters(data: LiveBookDataContextType) {
  return {
    getBookStringified: () => data.bookStringified || "",
    getBackgroundsForBook: () => data.backgroundsForBook,
    getBackgroundSongsForBook: () => data.backgroundSongsForBook,
    getCharactersData: () => data.charactersData,
    getBookData: () => data.bookData,
    getChapters: () => data.chapters,
  };
}
