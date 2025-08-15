import { bookDataLoader } from "@player/services/bookDataLoader";
import { getBookBaseUrl, joinPath, URL_SEGMENTS } from "./assetUrls";

/**
 * Returns the module URL for compiled/<fileName>.js with the token query correctly preserved.
 * - fileName: "bookData" -> ends up as compiled/bookData.js
 * - cacheBust: optional number; if provided, appended as `t=<cacheBust>` after other query params
 */

export function getBookDataModuleUrl(fileName: string, cacheBust?: number | null): string {
  const rel = joinPath(URL_SEGMENTS.COMPILED, `${fileName}.js`);
  const prefix = bookDataLoader.getAssetPrefix();
  const rawQuery = bookDataLoader.getAssetQuery();

  if (prefix) {
    const base = prefix.replace(/\/+$/, "");
    const url = `${base}/${rel}`;

    // preserve existing token query params and append cache bust param
    if (rawQuery) {
      const params = new URLSearchParams(rawQuery);
      if (cacheBust) params.set("t", String(cacheBust));
      const q = params.toString();
      return q ? `${url}?${q}` : url;
    }

    return cacheBust ? `${url}?t=${cacheBust}` : url;
  }

  // fallback to server streaming path: /api/core/content/assets/books/<slug>/compiled/<fileName>.js?t=...
  const fallback = `${getBookBaseUrl()}/${rel}`;
  return cacheBust ? `${fallback}?t=${cacheBust}` : fallback;
}
