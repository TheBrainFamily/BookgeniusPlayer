/**
 * Shared Types for BookGenius
 *
 * Canonical type definitions shared across all apps.
 * Import from here to ensure consistency.
 */

// =============================================================================
// Asset Types
// =============================================================================

/**
 * Information about a stored asset (image, video, etc.)
 */
export interface AssetInfo {
  url: string;
  versionId: string;
  contentType?: string;
}

// =============================================================================
// Character Types
// =============================================================================

/**
 * Metadata stored in the characterMetadata table.
 */
export interface CharacterMetadata {
  displayName?: string;
  summary?: string;
  aiPrompt?: string;
  avatarGenerationState?: "generating" | "ready" | "error" | "none";
  avatarProposalUrls?: string[];
}

/**
 * Complete character bundle with metadata and asset URLs.
 * This is the canonical type for character data across all apps.
 */
export interface CharacterBundle {
  path: string;
  slug: string;
  name: string;
  metadata: CharacterMetadata;
  avatar?: AssetInfo;
  avatarLarge?: AssetInfo;
  speaks?: AssetInfo;
  listens?: AssetInfo;
}
