"use client";

/**
 * useCharacterBundle - Hook for fetching individual character data
 *
 * This hook is independent of BookProvider and can be used anywhere.
 * It fetches the full character bundle (metadata + asset URLs).
 *
 * Example:
 *   const { bundle, isLoading } = useCharacterBundle("books/1984/characters/winston");
 *   if (bundle?.avatar) {
 *     <img src={bundle.avatar.url} />
 *   }
 */

import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { CharacterBundle } from "@convex/lib/sharedTypes";

// Re-export for consumers that import from this file
export type { CharacterBundle } from "@convex/lib/sharedTypes";

interface UseCharacterBundleResult {
  bundle: CharacterBundle | null | undefined;
  isLoading: boolean;
  error: Error | null;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Fetch a character bundle by path.
 *
 * @param characterPath - Full path to character folder, e.g., "books/1984/characters/winston"
 * @returns Character bundle with metadata and asset URLs
 *
 * @example
 * function CharacterCard({ characterPath }: { characterPath: string }) {
 *   const { bundle, isLoading } = useCharacterBundle(characterPath);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (!bundle) return <EmptyState />;
 *
 *   return (
 *     <div>
 *       <h3>{bundle.name}</h3>
 *       {bundle.avatar && <img src={bundle.avatar.url} alt={bundle.name} />}
 *     </div>
 *   );
 * }
 */
export function useCharacterBundle(
  characterPath: string | null | undefined,
): UseCharacterBundleResult {
  const {
    data: bundle,
    isLoading,
    error,
  } = useQuery({
    ...convexQuery(api.bookQueries.getCharacterBundle, characterPath ? { characterPath } : "skip"),
    enabled: !!characterPath,
  });

  return {
    bundle: bundle as CharacterBundle | null | undefined,
    isLoading,
    error: error as Error | null,
  };
}

// =============================================================================
// Helper: Check bundle completeness
// =============================================================================

/**
 * Check if a character bundle has all required assets.
 */
export function isCompleteBundle(bundle: CharacterBundle | null | undefined): boolean {
  if (!bundle) return false;
  return !!(bundle.avatar && bundle.speaks && bundle.listens);
}

/**
 * Get list of missing assets from a bundle.
 */
export function getMissingAssets(
  bundle: CharacterBundle | null | undefined,
): ("avatar" | "speaks" | "listens")[] {
  if (!bundle) return ["avatar", "speaks", "listens"];

  const missing: ("avatar" | "speaks" | "listens")[] = [];
  if (!bundle.avatar) missing.push("avatar");
  if (!bundle.speaks) missing.push("speaks");
  if (!bundle.listens) missing.push("listens");
  return missing;
}
