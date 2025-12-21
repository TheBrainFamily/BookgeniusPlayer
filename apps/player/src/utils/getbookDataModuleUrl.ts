import { getBookBaseUrl, joinPath, URL_SEGMENTS } from "./assetUrls";

/**
 * Returns the module URL for compiled/<fileName>.js
 * - fileName: "bookData" -> ends up as compiled/bookData.js
 * - cacheBust: optional number; if provided, appended as `t=<cacheBust>` query param
 */
export function getBookDataModuleUrl(fileName: string, cacheBust?: number | null): string {
  const rel = joinPath(URL_SEGMENTS.COMPILED, `${fileName}.js`);

  // In Convex-only mode, use the server streaming path
  const url = `${getBookBaseUrl()}/${rel}`;
  return cacheBust ? `${url}?t=${cacheBust}` : url;
}
