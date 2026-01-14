/**
 * Folder Pattern Detection
 *
 * Utilities for detecting folder types in the BookGenius structure.
 * Used by UI components to render appropriate views (book dashboard, character grid, etc.)
 */

// =============================================================================
// Folder Type Detection
// =============================================================================

export type DetectedFolderType =
  | "book"
  | "character"
  | "characters-container"
  | "chapters-container"
  | "backgrounds-container"
  | "music-container"
  | "books-root"
  | "unknown";

/**
 * Detect the type of folder based on its path.
 */
export function detectFolderType(path: string): DetectedFolderType {
  // Infer from path structure
  const segments = path.split("/").filter(Boolean);

  // Root "books" folder
  if (segments.length === 1 && segments[0] === "books") {
    return "books-root";
  }

  // Container folders (e.g., "books/1984/characters")
  if (segments.length >= 2) {
    const lastSegment = segments[segments.length - 1];

    switch (lastSegment) {
      case "characters":
        return "characters-container";
      case "chapters":
        return "chapters-container";
      case "backgrounds":
        return "backgrounds-container";
      case "music":
        return "music-container";
    }
  }

  // A folder directly under "books" is likely a book
  if (segments.length === 2 && segments[0] === "books") {
    return "book";
  }

  // A folder under characters container is likely a character
  if (segments.length >= 4 && segments[0] === "books" && segments[2] === "characters") {
    return "character";
  }

  return "unknown";
}

// =============================================================================
// Path Parsing Utilities
// =============================================================================

export interface ParsedBookPath {
  bookSlug: string;
  bookPath: string;
}

export interface ParsedCharacterPath extends ParsedBookPath {
  characterSlug: string;
  characterPath: string;
}

/**
 * Parse a path to extract book information.
 * Returns null if path is not inside a book folder.
 */
export function parseBookPath(path: string): ParsedBookPath | null {
  const segments = path.split("/").filter(Boolean);

  if (segments.length < 2 || segments[0] !== "books") {
    return null;
  }

  return { bookSlug: segments[1], bookPath: `books/${segments[1]}` };
}

/**
 * Parse a path to extract character information.
 * Returns null if path is not a character folder.
 */
export function parseCharacterPath(path: string): ParsedCharacterPath | null {
  const segments = path.split("/").filter(Boolean);

  // Must be: books/{bookSlug}/characters/{characterSlug}
  if (segments.length < 4 || segments[0] !== "books" || segments[2] !== "characters") {
    return null;
  }

  return {
    bookSlug: segments[1],
    bookPath: `books/${segments[1]}`,
    characterSlug: segments[3],
    characterPath: `books/${segments[1]}/characters/${segments[3]}`,
  };
}

/**
 * Get the parent book path from any path within a book structure.
 */
export function getBookPathFromAny(path: string): string | null {
  const parsed = parseBookPath(path);
  return parsed?.bookPath ?? null;
}

// =============================================================================
// Path Construction Helpers
// =============================================================================

export function buildCharactersPath(bookPath: string): string {
  return `${bookPath}/characters`;
}

export function buildChaptersPath(bookPath: string): string {
  return `${bookPath}/chapters`;
}

export function buildBackgroundsPath(bookPath: string): string {
  return `${bookPath}/backgrounds`;
}

export function buildMusicPath(bookPath: string): string {
  return `${bookPath}/music`;
}

export function buildCharacterPath(bookPath: string, characterSlug: string): string {
  return `${bookPath}/characters/${characterSlug}`;
}

// =============================================================================
// Display Helpers
// =============================================================================

const FOLDER_ICONS: Record<DetectedFolderType, string> = {
  "books-root": "📚",
  book: "📖",
  character: "👤",
  "characters-container": "👥",
  "chapters-container": "📜",
  "backgrounds-container": "🎬",
  "music-container": "🎵",
  unknown: "📁",
};

export function getFolderIcon(type: DetectedFolderType): string {
  return FOLDER_ICONS[type];
}

const FOLDER_LABELS: Record<DetectedFolderType, string> = {
  "books-root": "Books",
  book: "Book",
  character: "Character",
  "characters-container": "Characters",
  "chapters-container": "Chapters",
  "backgrounds-container": "Backgrounds",
  "music-container": "Music",
  unknown: "Folder",
};

export function getFolderLabel(type: DetectedFolderType): string {
  return FOLDER_LABELS[type];
}
