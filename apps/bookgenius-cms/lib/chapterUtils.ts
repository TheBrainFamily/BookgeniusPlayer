/**
 * Utility functions for parsing chapter information
 */

/**
 * Parses a chapter number from a file basename.
 * Handles formats like "chapter-1", "chapter_2", "chapter 3", or just "1"
 */
export const parseChapterNumberFromBasename = (basename: string): number | undefined => {
  const match = basename.match(/chapter[-_ ]?(\d+)/i) || basename.match(/^(\d+)/);
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : undefined;
};
