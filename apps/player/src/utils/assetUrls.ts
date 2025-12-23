// utils/assetUrls.ts
import { getBookSlug } from "@player/state/bookDataStore";

// =============================================================================
// Live Mode Asset URL Registry
// =============================================================================
// In live mode, character media URLs come from Convex as absolute URLs.
// This registry maps asset patterns to their absolute URLs.

let liveAssetUrlRegistry: Map<string, string> | null = null;
// Maps video URLs back to their avatar URLs (for normalizeSrcForInlineAvatar)
let videoToAvatarRegistry: Map<string, string> | null = null;

export const setLiveAssetUrls = (urls: Map<string, string>, videoToAvatar?: Map<string, string>) => {
  liveAssetUrlRegistry = urls;
  videoToAvatarRegistry = videoToAvatar || null;
};

export const clearLiveAssetUrls = () => {
  liveAssetUrlRegistry = null;
  videoToAvatarRegistry = null;
};

const getLiveAssetUrl = (pattern: string): string | null => {
  if (!liveAssetUrlRegistry) return null;
  // Try exact match first
  const exact = liveAssetUrlRegistry.get(pattern);
  if (exact) return exact;
  // Try lowercase match (patterns are typically lowercase)
  const lower = liveAssetUrlRegistry.get(pattern.toLowerCase());
  if (lower) return lower;
  return null;
};

/**
 * For live mode: look up the avatar URL for a given video URL.
 * Used by normalizeSrcForInlineAvatar to get the correct avatar.
 */
export const getAvatarUrlForVideo = (videoUrl: string): string | null => {
  if (!videoToAvatarRegistry) return null;
  return videoToAvatarRegistry.get(videoUrl) || null;
};

// Maps listens URL -> speaks URL (for CharacterMedia)
let listensToSpeaksRegistry: Map<string, string> | null = null;

export const setListensToSpeaksUrls = (mapping: Map<string, string>) => {
  listensToSpeaksRegistry = mapping;
};

export const clearListensToSpeaksUrls = () => {
  listensToSpeaksRegistry = null;
};

/**
 * For live mode: look up the speaks URL for a given listens URL.
 * Used by CharacterMedia to get the correct talking video.
 */
export const getSpeaksUrlForListens = (listensUrl: string): string | null => {
  if (!listensToSpeaksRegistry) return null;
  return listensToSpeaksRegistry.get(listensUrl) || null;
};

export const URL_SEGMENTS = { ASSETS: "assets", COMPILED: "compiled", AUDIO_EXT: ".mp3" };

export function joinPath(...parts: string[]) {
  return parts
    .map((p) => String(p).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

/**
 * Build final URL using prefix. In Convex mode, we don't use prefixes
 * since assets come with absolute URLs.
 */
function buildFromPrefix(_relativePath: string): string | null {
  // In Convex-only mode, we don't use asset prefixes
  return null;
}

// exported helpers (very small)
export const getBookAssetBaseUrl = (): string => {
  const built = buildFromPrefix(URL_SEGMENTS.ASSETS);
  if (built) return built;
};

export const getBookAssetUrl = (assetPath: string): string => {
  // If it's already an absolute URL (live mode), return as-is
  if (assetPath.startsWith("http://") || assetPath.startsWith("https://")) {
    return assetPath;
  }

  // Check live asset URL registry (for character media in live mode)
  const liveUrl = getLiveAssetUrl(assetPath);
  if (liveUrl) {
    return liveUrl;
  }

  const rel = assetPath.replace(/^\//, "");
  // ensure we build under the "assets" folder inside the versioned prefix
  const built = buildFromPrefix(joinPath(URL_SEGMENTS.ASSETS, rel));

  if (built) return built;
};

export const buildAudioUrl = (trackId: string): string => {
  // If it's already an absolute URL (live mode), just add .mp3 extension
  if (trackId.startsWith("http://") || trackId.startsWith("https://")) {
    return `${trackId}${URL_SEGMENTS.AUDIO_EXT}`;
  }

  const file = `${trackId}${URL_SEGMENTS.AUDIO_EXT}`;
  const built = buildFromPrefix(joinPath(URL_SEGMENTS.ASSETS, file));
  if (built) return built;
};
export const getBookDataUrl = (fileName: string): string => {
  const rel = joinPath(URL_SEGMENTS.COMPILED, fileName);
  const built = buildFromPrefix(rel);
  if (built) return built;
};
