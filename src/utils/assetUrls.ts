import { bookDataLoader } from "@/services/bookDataLoader";

/**
 * Get the base URL for book assets based on the current book
 */
export function getBookAssetBaseUrl(): string {
  const currentBook = bookDataLoader.getCurrentBook();
  return `/books/${currentBook}/assets`;
}

/**
 * Get the full URL for a book asset
 */
export function getBookAssetUrl(assetPath: string): string {
  const baseUrl = getBookAssetBaseUrl();
  return `${baseUrl}/books/${assetPath}`;
}

/**
 * Get the URL for book data files (compiled JS)
 */
export function getBookDataUrl(fileName: string): string {
  const currentBook = bookDataLoader.getCurrentBook();
  return `/books/${currentBook}/compiled/${fileName}`;
}

/**
 * Build URL for audio tracks (MP3 files)
 */
export function buildAudioUrl(trackId: string): string {
  const currentBook = bookDataLoader.getCurrentBook();
  return `/books/${currentBook}/assets/${trackId}.mp3`;
}
