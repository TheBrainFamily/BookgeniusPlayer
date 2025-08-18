// utils/assetUrls.ts
import { bookDataLoader } from "@player/services/bookDataLoader";

const API_BASE_URL = typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL : "/api/core/content/assets/";

export const URL_SEGMENTS = { ASSETS: "assets", COMPILED: "compiled", AUDIO_EXT: ".mp3" };

export function joinPath(...parts: string[]) {
  return parts
    .map((p) => String(p).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

/**
 * Build final URL using prefix+query stored in bookDataLoader.
 * If no assetPrefix is set, returns null (caller should use fallback).
 */
function buildFromPrefix(relativePath: string): string | null {
  const prefix = bookDataLoader.getAssetPrefix();
  if (!prefix) return null;

  const query = bookDataLoader.getAssetQuery();
  const base = prefix.replace(/\/+$/, "");
  const rel = relativePath.replace(/^\/+/, "");
  const url = `${base}/${rel}`;
  return query ? `${url}?${query}` : url;
}

export const getBookBaseUrl = () => `${API_BASE_URL}books/${bookDataLoader.getCurrentBook()}`;

// exported helpers (very small)
export const getBookAssetBaseUrl = (): string => {
  const built = buildFromPrefix(URL_SEGMENTS.ASSETS);
  if (built) return built;
  return `${getBookBaseUrl()}/${URL_SEGMENTS.ASSETS}`;
};

export const getBookAssetUrl = (assetPath: string): string => {
  const rel = assetPath.replace(/^\//, "");
  // ensure we build under the "assets" folder inside the versioned prefix
  const built = buildFromPrefix(joinPath(URL_SEGMENTS.ASSETS, rel));
  if (built) return built;
  return `${getBookAssetBaseUrl()}/${rel}`;
};

export const buildAudioUrl = (trackId: string): string => {
  const file = `${trackId}${URL_SEGMENTS.AUDIO_EXT}`;
  const built = buildFromPrefix(joinPath(URL_SEGMENTS.ASSETS, file));
  if (built) return built;
  return `${getBookAssetBaseUrl()}/${file}`;
};
export const getBookDataUrl = (fileName: string): string => {
  const rel = joinPath(URL_SEGMENTS.COMPILED, fileName);
  const built = buildFromPrefix(rel);
  if (built) return built;
  return `${getBookBaseUrl()}/${rel}`;
};
