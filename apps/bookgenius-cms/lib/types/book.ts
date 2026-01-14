/**
 * BookGenius CMS Type System
 *
 * Metadata is stored in app-level tables:
 * - books (book metadata)
 * - characterMetadata (character metadata)
 * - chapterMetadata (chapter metadata)
 * - backgroundCues / musicCues (cue positions)
 */

// Re-export shared types from canonical location
export {
  type AssetInfo,
  type CharacterBundle,
  type CharacterMetadata,
} from "@convex/lib/sharedTypes";

// =============================================================================
// Metadata Types
// =============================================================================

export interface BookMetadata {
  title?: string;
  author?: string;
  language?: string;
  form?: string;
  visualStyle?: string;
  backgroundStyle?: string;
  periodStyle?: string;
  avatarStyle?: string;
}

export interface ChapterMetadata {
  chapterNumber: number;
  title?: string;
  paragraphCount?: number;
  sourceFormat?: string;
}

export interface BackgroundCueMetadata {
  chapter: number;
  paragraph: number;
  backgroundColor?: string;
  textColor?: string;
}

export interface MusicCueMetadata {
  chapter: number;
  paragraph: number;
  order?: number;
}

// =============================================================================
// Derived Types (for UI components)
// =============================================================================

export interface ChapterInfo {
  path: string; // Full path to chapter asset
  basename: string; // e.g., "chapter-1.xml"
  metadata: ChapterMetadata;
  url: string;
  versionId: string;
}

export interface BackgroundInfo {
  path: string;
  basename: string;
  metadata?: BackgroundCueMetadata;
  url: string;
  versionId: string;
}

export interface MusicInfo {
  path: string;
  basename: string;
  metadata?: MusicCueMetadata;
  url: string;
  versionId: string;
}

export interface BookInfo {
  path: string; // e.g., "books/1984-English"
  slug: string; // e.g., "1984-English"
  metadata: BookMetadata;
  characterCount?: number;
  chapterCount?: number;
}

// =============================================================================
// Character Asset Identification
// =============================================================================

export type CharacterAssetType = "avatar" | "speaks" | "listens";

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
