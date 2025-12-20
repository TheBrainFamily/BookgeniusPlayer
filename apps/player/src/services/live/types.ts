/**
 * Types for live mode integration with Convex CMS.
 */

// =============================================================================
// Asset Types (from CMS)
// =============================================================================

export interface AssetVersion {
  _id: string;
  versionNumber: number;
  state: "draft" | "published" | "archived";
  storageId?: string;
  r2Key?: string;
  contentType?: string;
  size?: number;
  createdAt: number;
}

export interface Asset {
  _id: string;
  folderPath: string;
  basename: string;
  publishedVersionId?: string;
  draftVersionId?: string;
}

// =============================================================================
// Chapter Types
// =============================================================================

export interface ChapterData {
  /** Folder path in CMS (e.g., "books/1984-English/chapters") */
  folderPath: string;
  /** File basename (e.g., "chapter1.xml") */
  basename: string;
  /** Version ID to load content from */
  versionId: string;
  /** Chapter number extracted from filename */
  chapterNumber: number;
  /** Raw XML content (fetched separately) */
  xmlContent?: string;
}

// =============================================================================
// Background/Music Types
// =============================================================================

export interface BackgroundData {
  /** Asset path in CMS */
  path: string;
  /** URL to the image */
  url: string;
  /** Chapter and paragraph position data */
  position?: { chapter: number; paragraph: number };
}

export interface MusicData {
  /** Asset path in CMS */
  path: string;
  /** URL to the audio file */
  url: string;
  /** Chapter and paragraph position data */
  position?: { chapter: number; paragraph: number };
}

// =============================================================================
// Character Types (for live loading)
// =============================================================================

export interface CharacterAssets {
  /** Character slug (e.g., "WinstonSmith") */
  slug: string;
  /** Display name */
  name: string;
  /** Avatar image URL */
  avatarUrl?: string;
  /** Speaking animation/image URL */
  speaksUrl?: string;
  /** Listening animation/image URL */
  listensUrl?: string;
}

// =============================================================================
// Book Metadata Types
// =============================================================================

export interface LiveBookMetadata {
  /** Book slug (e.g., "1984-English") */
  slug: string;
  /** Book display name */
  name: string;
  /** Language (e.g., "english", "polish") */
  language: string;
  /** Book form (e.g., "prose", "play", "mixed") */
  form: string;
  /** Author name */
  author?: string;
}

// =============================================================================
// Live Mode State
// =============================================================================

export interface LiveBookState {
  /** Whether data is still loading */
  isLoading: boolean;
  /** Error message if loading failed */
  error?: string;
  /** Book metadata */
  metadata?: LiveBookMetadata;
  /** Processed HTML content (from xmlToComplexHtml) */
  bookStringified?: string;
  /** Chapter titles extracted from XML */
  chapterTitles?: Array<{ id: string; title: string }>;
  /** Background positions */
  backgrounds?: BackgroundData[];
  /** Music positions */
  music?: MusicData[];
  /** Character assets */
  characters?: CharacterAssets[];
  /** Version counter for reactivity */
  textVersion: number;
}
