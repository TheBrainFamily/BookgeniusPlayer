import { useEffect, useMemo } from "react";
import debounce from "lodash.debounce";
import { useSearchModal } from "@/stores/modals/searchModal.store";
import { performLocalDOMSearch } from "@/searchModal";
import { useLocationRange } from "@/hooks/useLocationRange";
import { getBookData } from "@/booksData/getBookData";
import { Location } from "@/state/LocationContext";

export const useSearchLogic = () => {
  const { query, isOpen, setResults } = useSearchModal();
  const { debouncedLocation } = useLocationRange();
  const bookData = getBookData();

  const debouncedPerformSearch = useMemo(() => {
    let latestSearchId = 0;

    return debounce(async (searchQuery: string, location: Location, bookSlug: string) => {
      if (!searchQuery?.trim()) {
        setResults({ header: "Please enter a search term.", items: [], isLoading: false });
        return;
      }

      const searchId = ++latestSearchId;

      try {
        const results = await performLocalDOMSearch(searchQuery, location, bookSlug);

        if (searchId === latestSearchId) {
          setResults(results);
        }
      } catch {
        if (searchId === latestSearchId) {
          setResults({ header: "Search failed. Please try again.", items: [], isLoading: false });
        }
      }
    }, 350);
  }, [setResults]);

  useEffect(() => {
    if (isOpen && query.trim()) {
      debouncedPerformSearch(query, debouncedLocation, bookData.slug);
    } else if (isOpen && !query.trim()) {
      setResults({ header: "Please enter a search term.", items: [], isLoading: false });
    }
  }, [query, isOpen, debouncedPerformSearch, debouncedLocation, bookData.slug, setResults]);
};
