/**
 * Live Data Injector
 *
 * This module injects live data from Convex into the existing
 * book data getter caches, allowing existing components to work
 * without modification.
 */

import type { BackgroundForBook, BackgroundSongSection, CharacterData, BookData, Chapter } from "@player/types/book";

// Import the actual cache setters from the getter modules
import { setBookStringifiedCache, clearBookStringifiedCache } from "@player/genericBookDataGetters/getBookStringified";
import { setBookDataCache, clearBookDataCache } from "@player/genericBookDataGetters/getBookData";
import { setBackgroundsCache, clearBackgroundsCache } from "@player/genericBookDataGetters/getBackgroundsForBook";
import { setBackgroundSongsCache, clearBackgroundSongsCache } from "@player/genericBookDataGetters/getBackgroundSongsForBook";
import { setCharactersDataCache, clearCharactersDataCache } from "@player/genericBookDataGetters/getCharactersData";
import { setNotesCache, clearNotesCache } from "@player/genericBookDataGetters/getNotes";
import { setCutScenesCache, clearCutScenesCache } from "@player/genericBookDataGetters/getCutScenesForBook";
import { setAudiobookTracksCache, clearAudiobookTracksCache } from "@player/genericBookDataGetters/getAudiobookTracksForBook";
import { setKnownVideoFilesCache, clearKnownVideoFilesCache } from "@player/genericBookDataGetters/getKnownVideoFiles";
import { setAllVariantsCache, clearAllVariantsCache } from "@player/genericBookDataGetters/getAllVariants";
import { setKnownVideos } from "@player/utils/getFilePathsForName";
import { setLiveAssetUrls, clearLiveAssetUrls, setListensToSpeaksUrls, clearListensToSpeaksUrls } from "@player/utils/assetUrls";

// Type for character bundle from Convex
interface CharacterBundle {
  slug: string;
  name: string;
  avatar?: { url: string };
  speaks?: { url: string };
  listens?: { url: string };
}

// =============================================================================
// Live Mode State
// =============================================================================

let _isLiveMode = false;
let _virtualTopSpacerDisabled = true; // Disabled for debugging live mode reload issues

export const setLiveMode = (enabled: boolean) => {
  _isLiveMode = enabled;
};

export const isLiveMode = (): boolean => {
  return _isLiveMode;
};

/**
 * Temporarily disable the virtual-top-spacer for debugging live mode reload issues.
 * When disabled, the spacer height stays at 0 and no scroll compensation occurs.
 */
export const setVirtualTopSpacerDisabled = (disabled: boolean) => {
  _virtualTopSpacerDisabled = disabled;
};

export const isVirtualTopSpacerDisabled = (): boolean => {
  return _virtualTopSpacerDisabled;
};

// =============================================================================
// Chapters Cache (not in existing getter modules)
// =============================================================================

let _chaptersCache: Chapter[] | null = null;

export const setChaptersCache = (value: Chapter[]) => {
  _chaptersCache = value;
};

export const getChaptersFromLive = (): Chapter[] => {
  return _chaptersCache || [];
};

// =============================================================================
// Inject All Data
// =============================================================================

interface LiveBookData {
  bookStringified: string;
  backgroundsForBook: BackgroundForBook[];
  backgroundSongsForBook: BackgroundSongSection[];
  charactersData: CharacterData[];
  bookData: BookData;
  chapters: Chapter[];
  characterBundles?: CharacterBundle[];
}

// Helper to convert character slug to file pattern (lowercase, spaces to hyphens)
const slugToFilePattern = (slug: string): string => {
  return slug
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/"/g, "")
    .replace(/(\(|\))/g, "");
};

export const injectLiveData = (data: LiveBookData) => {
  console.log("[LiveMode] Starting data injection...");
  setLiveMode(true);
  console.log("[LiveMode] Live mode enabled");

  // Inject data into the REAL getter module caches
  console.log("[LiveMode] Injecting book stringified data");
  setBookStringifiedCache(data.bookStringified);
  console.log("[LiveMode] Injecting backgrounds data:", data.backgroundsForBook.length, "items");
  setBackgroundsCache(data.backgroundsForBook);
  // BackgroundSongSection is compatible with BackgroundSongForBook
  console.log("[LiveMode] Injecting background songs data:", data.backgroundSongsForBook.length, "items");
  setBackgroundSongsCache(data.backgroundSongsForBook as any);
  console.log("[LiveMode] Injecting characters data:", data.charactersData.length, "items");
  setCharactersDataCache(data.charactersData);
  console.log("[LiveMode] Injecting book data");
  setBookDataCache(data.bookData);
  console.log("[LiveMode] Injecting chapters data:", data.chapters.length, "items");
  setChaptersCache(data.chapters);
  // These are not in CMS yet - inject empty arrays
  console.log("[LiveMode] Injecting empty arrays for notes, cut scenes, audiobook tracks, and variants");
  setNotesCache([]);
  setCutScenesCache([]);
  setAudiobookTracksCache([]);
  setAllVariantsCache([]);

  // Build known videos list and asset URL registry from character bundles
  console.log("[LiveMode] Building video assets from character bundles...");
  const knownVideos: string[] = [];
  const assetUrlMap = new Map<string, string>();
  const videoToAvatarMap = new Map<string, string>();
  const listensToSpeaksMap = new Map<string, string>();

  if (data.characterBundles) {
    console.log("[LiveMode] Processing", data.characterBundles.length, "character bundles");
    for (const bundle of data.characterBundles) {
      console.log("[LiveMode] Processing bundle for:", bundle.slug);
      const pattern = slugToFilePattern(bundle.slug);
      const avatarUrl = bundle.avatar?.url;
      const listensUrl = bundle.listens?.url;
      const speaksUrl = bundle.speaks?.url;

      // Avatar
      if (avatarUrl) {
        const avatarPattern = `${pattern}.png`;
        console.log("[LiveMode] Adding avatar:", avatarPattern);
        assetUrlMap.set(avatarPattern, avatarUrl);
      }

      // Speaks video
      if (speaksUrl) {
        const speaksPattern = `${pattern}-speaks.mp4`;
        console.log("[LiveMode] Adding speaks video:", speaksPattern);
        knownVideos.push(speaksPattern);
        assetUrlMap.set(speaksPattern, speaksUrl);
        // Map video URL -> avatar URL for normalizeSrcForInlineAvatar
        if (avatarUrl) {
          videoToAvatarMap.set(speaksUrl, avatarUrl);
        }
      }

      // Listens video
      if (listensUrl) {
        const listensPattern = `${pattern}-listens.mp4`;
        console.log("[LiveMode] Adding listens video:", listensPattern);
        knownVideos.push(listensPattern);
        assetUrlMap.set(listensPattern, listensUrl);
        // Map video URL -> avatar URL for normalizeSrcForInlineAvatar
        if (avatarUrl) {
          videoToAvatarMap.set(listensUrl, avatarUrl);
        }
        // Map listens URL -> speaks URL for CharacterMedia
        if (speaksUrl) {
          listensToSpeaksMap.set(listensUrl, speaksUrl);
        }
      }
    }
  } else {
    console.log("[LiveMode] No character bundles provided");
  }

  console.log("[LiveMode] Setting video caches...");
  setKnownVideoFilesCache(knownVideos);
  console.log("[LiveMode] Setting known videos list");
  setKnownVideos(knownVideos);
  console.log("[LiveMode] Setting live asset URLs");
  setLiveAssetUrls(assetUrlMap, videoToAvatarMap);
  setListensToSpeaksUrls(listensToSpeaksMap);
  console.log("[LiveMode] Video caches set");

  console.log("[LiveMode] Known videos:", knownVideos);
  console.log("[LiveMode] Asset URL map size:", assetUrlMap.size);
  console.log("[LiveMode] Video to avatar map size:", videoToAvatarMap.size);
  console.log("[LiveMode] Listens to speaks map size:", listensToSpeaksMap.size);

  console.log("[LiveMode] Data injected into caches");
};

export const clearLiveData = () => {
  setLiveMode(false);

  // Clear the real getter module caches
  clearBookStringifiedCache();
  clearBookDataCache();
  clearBackgroundsCache();
  clearBackgroundSongsCache();
  clearCharactersDataCache();
  clearNotesCache();
  clearCutScenesCache();
  clearAudiobookTracksCache();
  clearKnownVideoFilesCache();
  clearAllVariantsCache();
  clearLiveAssetUrls();
  clearListensToSpeaksUrls();
  setKnownVideos([]);
  _chaptersCache = null;

  console.log("[LiveMode] Caches cleared");
};

/**
 * Update just the character bundle caches without touching book content.
 * Used when character descriptions/avatars change but chapter content hasn't.
 * This allows character media to update without losing scroll position.
 */
export const updateCharacterBundles = (bundles: CharacterBundle[]) => {
  if (!_isLiveMode) {
    console.warn("[LiveMode] updateCharacterBundles called but not in live mode");
    return;
  }

  console.log("[LiveMode] Updating character bundles:", bundles.length, "characters");

  const knownVideos: string[] = [];
  const assetUrlMap = new Map<string, string>();
  const videoToAvatarMap = new Map<string, string>();
  const listensToSpeaksMap = new Map<string, string>();

  for (const bundle of bundles) {
    const pattern = slugToFilePattern(bundle.slug);
    const avatarUrl = bundle.avatar?.url;
    const listensUrl = bundle.listens?.url;
    const speaksUrl = bundle.speaks?.url;

    if (avatarUrl) {
      assetUrlMap.set(`${pattern}.png`, avatarUrl);
    }

    if (speaksUrl) {
      knownVideos.push(`${pattern}-speaks.mp4`);
      assetUrlMap.set(`${pattern}-speaks.mp4`, speaksUrl);
      if (avatarUrl) {
        videoToAvatarMap.set(speaksUrl, avatarUrl);
      }
    }

    if (listensUrl) {
      knownVideos.push(`${pattern}-listens.mp4`);
      assetUrlMap.set(`${pattern}-listens.mp4`, listensUrl);
      if (avatarUrl) {
        videoToAvatarMap.set(listensUrl, avatarUrl);
      }
      if (speaksUrl) {
        listensToSpeaksMap.set(listensUrl, speaksUrl);
      }
    }
  }

  setKnownVideoFilesCache(knownVideos);
  setKnownVideos(knownVideos);
  setLiveAssetUrls(assetUrlMap, videoToAvatarMap);
  setListensToSpeaksUrls(listensToSpeaksMap);

  console.log("[LiveMode] Character bundles updated (no remount)");
};
