/**
 * Extract book path from a folder path.
 * e.g., "books/jane-eyre/music" → "books/jane-eyre"
 *       "books/my-book/characters/hero" → "books/my-book"
 * Returns null if not a book folder.
 *
 * This uses the same pattern as the backend (convex/generateUploadUrl.ts)
 */
export function extractBookPath(folderPath: string): string | null {
  const match = folderPath.match(/^(books\/[^/]+)/);
  return match ? match[1] : null;
}
