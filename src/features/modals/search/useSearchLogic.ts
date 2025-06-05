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

  const debouncedPerformSearch = useMemo(() => {
    let latestSearchId = 0;

    return debounce(async (searchQuery: string, location: Location, bookSlug: string) => {
      if (!searchQuery?.trim()) {
        setResults({ header: "Please enter a search term.", items: [], isLoading: false });
        return;
      }

      const searchId = ++latestSearchId;

      try {
        let results = await performLocalDOMSearch(searchQuery, location, bookSlug);
        if (results.items.length === 0) {
          console.log("JUN 5 no results from local DOM search", results);
          results = await performUnifiedSearch(searchQuery, location);
        } else {
          console.log("JUN 5 results", results);
        }

        if (searchId === latestSearchId) {
          setResults(results);
        }
      } catch {
        if (searchId === latestSearchId) {
          setResults({ header: "Search failed. Please try again.", items: [], isLoading: false });
        }
      }
    }, 100);
  }, [setResults]);

  useEffect(() => {
    if (isOpen && query.trim()) {
      debouncedPerformSearch(query, debouncedLocation, CURRENT_BOOK);
    } else if (isOpen && !query.trim()) {
      setResults({ header: "Please enter a search term.", items: [], isLoading: false });
    }
  }, [query, isOpen, debouncedPerformSearch, debouncedLocation, CURRENT_BOOK, setResults]);
};
