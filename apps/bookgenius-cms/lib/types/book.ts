/**
 * BookGenius CMS Type System
 *
 * These types define the structure of metadata stored in folder.extra and asset.extra fields.
 * Type safety is enforced at the app layer (TypeScript + Zod validators), not at the DB level.
 *
 * Folder Structure:
 *   books/
 *     {book-slug}/                   <- BookFolderExtra
 *       characters/
 *         {character-slug}/          <- CharacterFolderExtra
 *           avatar.png
 *           speaks.mp4
 *           listens.mp4
 *       chapters/
 *         chapter-{n}.xml            <- ChapterExtra
 *       backgrounds/
 *         ch{n}-p{m}.mp4             <- BackgroundExtra
 *       music/
 *         {scene}.mp3                <- MusicExtra
 */

// =============================================================================
// Folder Extra Types (stored in folder.extra)
// =============================================================================

export interface BookFolderExtra {
  type: "book";
  title: string;
  author: string;
  language: string;
  form?: string; // e.g., "novel", "play", "poem"
  visualStyle?: string; // AI prompt for generating character visuals
}

export interface CharacterFolderExtra {
  type: "character";
  displayName: string;
  summary: string;
  aiPrompt?: string; // Additional prompt for generating this character's visuals
}

// Generic folder extras (characters, chapters, backgrounds, music containers)
export interface ContainerFolderExtra {
  type: "characters-container" | "chapters-container" | "backgrounds-container" | "music-container";
}

export type FolderExtra = BookFolderExtra | CharacterFolderExtra | ContainerFolderExtra | undefined;

// =============================================================================
// Asset Version Extra Types (stored in assetVersion.extra - versioned!)
// =============================================================================

export interface ChapterExtra {
  type: "chapter";
  chapterNumber: number;
  title: string;
}

export interface BackgroundExtra {
  type: "background";
  chapter: number;
  paragraph: number;
  backgroundColor: string; // hex color
  textColor: string; // hex color
}

export interface MusicExtra {
  type: "music";
  chapter: number;
  paragraph: number;
}

// Character assets don't need extra - they're identified by filename (avatar, speaks, listens)
export type CharacterAssetType = "avatar" | "speaks" | "listens";

export type AssetExtra = ChapterExtra | BackgroundExtra | MusicExtra | undefined;

// =============================================================================
// Derived Types (for UI components)
// =============================================================================

export interface CharacterBundle {
  path: string; // Full path to character folder, e.g., "books/1984/characters/winston"
  slug: string; // Character slug, e.g., "winston"
  meta: CharacterFolderExtra;
  avatar?: { url: string; versionId: string };
  speaks?: { url: string; versionId: string };
  listens?: { url: string; versionId: string };
}

export interface ChapterInfo {
  path: string; // Full path to chapter asset
  basename: string; // e.g., "chapter-1.xml"
  extra: ChapterExtra;
  url: string;
  versionId: string;
}

export interface BackgroundInfo {
  path: string;
  basename: string;
  extra: BackgroundExtra;
  url: string;
  versionId: string;
}

export interface MusicInfo {
  path: string;
  basename: string;
  extra: MusicExtra;
  url: string;
  versionId: string;
}

export interface BookInfo {
  path: string; // e.g., "books/1984-English"
  slug: string; // e.g., "1984-English"
  meta: BookFolderExtra;
  characterCount?: number;
  chapterCount?: number;
}

// =============================================================================
// Type Guards
// =============================================================================

export function isBookFolder(extra: unknown): extra is BookFolderExtra {
  return typeof extra === "object" && extra !== null && "type" in extra && (extra as BookFolderExtra).type === "book";
}

export function isCharacterFolder(extra: unknown): extra is CharacterFolderExtra {
  return typeof extra === "object" && extra !== null && "type" in extra && (extra as CharacterFolderExtra).type === "character";
}

export function isChapterAsset(extra: unknown): extra is ChapterExtra {
  return typeof extra === "object" && extra !== null && "type" in extra && (extra as ChapterExtra).type === "chapter";
}

export function isBackgroundAsset(extra: unknown): extra is BackgroundExtra {
  return typeof extra === "object" && extra !== null && "type" in extra && (extra as BackgroundExtra).type === "background";
}

export function isMusicAsset(extra: unknown): extra is MusicExtra {
  return typeof extra === "object" && extra !== null && "type" in extra && (extra as MusicExtra).type === "music";
}

// =============================================================================
// Character Asset Identification
// =============================================================================

const CHARACTER_ASSET_PATTERNS: Record<CharacterAssetType, RegExp> = {
  avatar: /^avatar\.(png|jpg|jpeg|webp)$/i,
  speaks: /^speaks\.(mp4|webm|mov)$/i,
  listens: /^listens\.(mp4|webm|mov)$/i,
};

export function getCharacterAssetType(filename: string): CharacterAssetType | null {
  for (const [type, pattern] of Object.entries(CHARACTER_ASSET_PATTERNS)) {
    if (pattern.test(filename)) {
      return type as CharacterAssetType;
    }
  }
  return null;
}

export function isCharacterAsset(filename: string): boolean {
  return getCharacterAssetType(filename) !== null;
}
