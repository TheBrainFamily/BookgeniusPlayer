// useSearchLogic.ts
import { useEffect, useMemo } from "react";
import debounce from "lodash.debounce";
import { useSearchModal } from "@/stores/modals/searchModal.store";
import { performLocalDOMSearch, performUnifiedSearch } from "@/searchModal";
import { useLocationRange } from "@/hooks/useLocationRange";
import { Location } from "@/state/LocationContext";
import { CURRENT_BOOK } from "@/consts";

export const useSearchLogic = () => {
  const { query, isOpen, setResults } = useSearchModal();
  const { debouncedLocation } = useLocationRange();

  /* ------------------------------------------------------------------ *
   * 1 ️⃣  Unified-search debounce (1 s, returns a real Promise)
   * ------------------------------------------------------------------ */
  const debouncedPerformUnifiedSearch = useMemo(() => {
    /**
     * lodash.debounce doesn’t natively return a promise you can await,
     * so we wrap it: we pass resolve/reject into the debounced callback
     * and build a new Promise around it.
     */
    const debouncedFn = debounce(
      (resolve: (v: unknown) => void, reject: (e: unknown) => void, q: string, loc: Location) => {
        performUnifiedSearch(q, loc).then(resolve).catch(reject);
      },
      1000, // ← one-second “pause after typing” window
      { leading: false, trailing: true },
    );

    // The wrapper we will actually call from our code
    const wrapped = (q: string, loc: Location) => new Promise((res, rej) => debouncedFn(res, rej, q, loc));

    // Re-expose lodash’s .cancel for cleanup
    // (Type-ignore because lodash types don’t know about it here)
    wrapped.cancel = debouncedFn.cancel;

    return wrapped;
  }, []);

  /* Cancel the 1-second timer if this hook unmounts */
  useEffect(
    () => () => {
      debouncedPerformUnifiedSearch.cancel?.();
    },
    [debouncedPerformUnifiedSearch],
  );

  /* ------------------------------------------------------------------ *
   * 2 ️⃣  Search pipeline (instant local, debounced remote)
   * ------------------------------------------------------------------ */
  const performSearch = useMemo(() => {
    let latestSearchId = 0;

    return async (searchQuery: string, location: Location, bookSlug: string) => {
      if (!searchQuery.trim()) {
        setResults({ header: "Please enter a search term.", items: [], isLoading: false });
        return;
      }

      const searchId = ++latestSearchId;

      try {
        /* ---------- 2a. local DOM search: runs immediately ---------- */
        let results = await performLocalDOMSearch(searchQuery, location, bookSlug);

        /* ---------- 2b. remote search (only if local came up empty) -- */
        if (results.items.length === 0) {
          setResults({ header: "Searching…", items: [], isLoading: true });

          // @ts-expect-error(this is wrong typing) TODO fix this if you want?
          results = await debouncedPerformUnifiedSearch(searchQuery, location);
        }

        /* Only keep the result of the most-recent keystroke batch */
        if (searchId === latestSearchId) {
          setResults(results);
        }
      } catch {
        if (searchId === latestSearchId) {
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
    if (isOpen && query.trim()) {
      debouncedTriggerSearch(query, debouncedLocation, CURRENT_BOOK);
    } else if (isOpen && !query.trim()) {
      setResults({ header: "Please enter a search term.", items: [], isLoading: false });
    }
  }, [query, isOpen, debouncedTriggerSearch, debouncedLocation, setResults]);
};
