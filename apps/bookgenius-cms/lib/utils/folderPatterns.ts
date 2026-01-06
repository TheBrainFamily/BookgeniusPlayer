/**
 * Folder Pattern Detection
 *
 * Utilities for detecting folder types in the BookGenius structure.
 * Used by UI components to render appropriate views (book dashboard, character grid, etc.)
 */

import {
  type FolderExtra,
  type CharacterAssetType,
  isBookFolder,
  isCharacterFolder,
  getCharacterAssetType,
} from "../types/book";

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
 * Detect the type of folder based on its path and extra field.
 *
 * Priority:
 * 1. Check extra field (explicit type)
 * 2. Infer from path structure
 */
export function detectFolderType(path: string, extra: FolderExtra): DetectedFolderType {
  // 1. Check explicit type in extra
  if (isBookFolder(extra)) return "book";
  if (isCharacterFolder(extra)) return "character";

  // 2. Infer from path structure
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

  // A folder directly under "books" (without extra) is likely a book
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
// Character Bundle Detection
// =============================================================================

export interface CharacterBundleCheck {
  hasAvatar: boolean;
  hasSpeaks: boolean;
  hasListens: boolean;
  isComplete: boolean;
  missing: CharacterAssetType[];
}

/**
 * Check if a folder contains a complete character bundle.
 *
 * A complete character bundle has:
 * - avatar.{png|jpg|jpeg|webp}
 * - speaks.{mp4|webm|mov}
 * - listens.{mp4|webm|mov}
 */
export function checkCharacterBundle(assetBasenames: string[]): CharacterBundleCheck {
  const found = { avatar: false, speaks: false, listens: false };

  for (const basename of assetBasenames) {
    const type = getCharacterAssetType(basename);
    if (type) {
      found[type] = true;
    }
  }

  const missing: CharacterAssetType[] = [];
  if (!found.avatar) missing.push("avatar");
  if (!found.speaks) missing.push("speaks");
  if (!found.listens) missing.push("listens");

  return {
    hasAvatar: found.avatar,
    hasSpeaks: found.speaks,
    hasListens: found.listens,
    isComplete: missing.length === 0,
    missing,
  };
}

/**
 * Quick check if a list of basenames looks like a character bundle.
 * Requires at least avatar to be present.
 */
export function isCharacterBundleLike(assetBasenames: string[]): boolean {
  return assetBasenames.some((name) => getCharacterAssetType(name) === "avatar");
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
