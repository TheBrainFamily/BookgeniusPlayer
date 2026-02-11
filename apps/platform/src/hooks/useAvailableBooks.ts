import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../../convex/_generated/api";
import { convex } from "../convexClient";

/**
 * Returns the set of book slugs that exist in Convex (i.e. are processed and available).
 * Returns `undefined` while loading — callers should treat undefined as "all available"
 * so the library renders without greyed-out state during the initial load.
 *
 * Returns `undefined` permanently if VITE_CONVEX_URL is not configured.
 */
export function useAvailableBooks(): Set<string> | undefined {
  const slugs = useQuery(api.bookQueries.listAvailableBookSlugs, convex ? {} : "skip");
  return useMemo(() => (slugs ? new Set(slugs) : undefined), [slugs]);
}
