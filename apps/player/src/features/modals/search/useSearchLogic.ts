import { useEffect, useMemo, useRef } from "react";
import debounce from "lodash.debounce";

import { useSearchModal } from "@player/stores/modals/searchModal.store";
import { findCharacterSentences, performCachedSearch, performUnifiedSearch } from "@player/searchModal";
import { Location } from "@player/state/LocationContext";
import { getSavedLocation } from "@player/helpers/paragraphsNavigation";
import { useBookConvex } from "@player/context/BookConvexContext";

export const useSearchLogic = () => {
  const { query, isOpen, setResults } = useSearchModal();
  const { charactersData } = useBookConvex();

  const latestSearchIdRef = useRef(0);

  /* ------------------------------------------------------------------ *
   * 1 ️⃣  Unified-search debounce (1 s, returns a real Promise)
   * ------------------------------------------------------------------ */
  const debouncedPerformUnifiedSearch = useMemo(() => {
    /**
     * lodash.debounce doesn't natively return a promise you can await,
     * so we wrap it: we pass resolve/reject into the debounced callback
     * and build a new Promise around it.
     */
    const debouncedFn = debounce(
      (resolve: (v: unknown) => void, reject: (e: unknown) => void, q: string, loc: Location) => {
        performUnifiedSearch(q, loc).then(resolve).catch(reject);
      },
      1000, // ← one-second "pause after typing" window
      { leading: false, trailing: true },
    );

    // The wrapper we will actually call from our code
    const wrapped = (q: string, loc: Location) => new Promise((res, rej) => debouncedFn(res, rej, q, loc));
    // Re-expose lodash's .cancel for cleanup
    // (Type-ignore because lodash types don't know about it here)
    wrapped.cancel = debouncedFn.cancel;

    return wrapped;
  }, []);

  /* Cancel the 1-second timer if this hook unmounts */
  useEffect(() => {
    if (query.trim()) {
      debouncedPerformUnifiedSearch.cancel?.();
    }

    return () => {
      debouncedPerformUnifiedSearch.cancel?.();
    };
  }, [query, debouncedPerformUnifiedSearch]);

  /* ------------------------------------------------------------------ *
   * 2 ️⃣  Search pipeline (instant local, debounced remote)
   * ------------------------------------------------------------------ */
  const performSearch = useMemo(() => {
    return async (searchQuery: string, location: Location) => {
      if (!searchQuery.trim()) {
        setResults({ header: "Please enter a search term.", items: [], isLoading: false });
        return;
      }

      const searchId = ++latestSearchIdRef.current;

      try {
        /* ---------- 2a. local DOM search: runs immediately ---------- */

        if (searchQuery.includes("@")) {
          searchQuery = searchQuery.replaceAll("@", "");
        }

        const character = charactersData.find(
          (character) => character.slug.toLowerCase() === searchQuery.toLowerCase() || character.characterName.toLowerCase() === searchQuery.toLowerCase(),
        );

        let results = character ? findCharacterSentences(character.slug, location) : performCachedSearch(searchQuery, location);

        // If the cache is still indexing, it will return isLoading: true
        if (results.isLoading) {
          setResults(results);
        }

        /* ---------- 2b. remote search (only if local came up empty) -- */
        if (results.items.length === 0 && !results.isLoading) {
          setResults({ header: "Searching…", items: [], isLoading: true });

          // @ts-expect-error(this is wrong typing) TODO fix this if you want?
          results = await debouncedPerformUnifiedSearch(searchQuery, location);
        }

        /* Only keep the result of the most-recent keystroke batch */
        if (searchId === latestSearchIdRef.current) {
          setResults(results);
        }
      } catch {
        if (searchId === latestSearchIdRef.current) {
          setResults({ header: "Search failed. Please try again.", items: [], isLoading: false });
        }
      }
    };
  }, [setResults, debouncedPerformUnifiedSearch]);

  /* ------------------------------------------------------------------ *
   * 3 ️⃣  Debounce typing noise (100 ms) before *starting* a search
   * ------------------------------------------------------------------ */
  const debouncedTriggerSearch = useMemo(() => debounce(performSearch, 100), [performSearch]);

  /* ------------------------------------------------------------------ *
   * 4 ️⃣  Fire searches when the modal is open & the query changes
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (query.trim()) {
      const latestLocation = getSavedLocation();
      void debouncedTriggerSearch(query, latestLocation);
    } else {
      debouncedTriggerSearch.cancel?.();
    }
  }, [query, debouncedTriggerSearch, setResults]);

  useEffect(() => {
    return () => {
      debouncedTriggerSearch.cancel?.();
    };
  }, [debouncedTriggerSearch]);
};
