import { useEffect, useMemo, useRef, useCallback } from "react";
import debounce from "lodash.debounce";

import { useSearchModal } from "@player/stores/modals/searchModal.store";
import {
  findCharacterSentences,
  performCachedSearch,
  performUnifiedSearch,
} from "@player/searchModal";
import { Location } from "@player/state/LocationContext";
import { getSavedLocation } from "@player/helpers/paragraphsNavigation";
import { useBookConvex } from "@player/context/BookConvexContext";

const TYPING_DEBOUNCE_MS = 100;
const REMOTE_SEARCH_DEBOUNCE_MS = 1000;
const REMOTE_SEARCH_MAX_WAIT_MS = 4000;

export const useSearchLogic = () => {
  const { query, setResults } = useSearchModal();
  const { charactersData } = useBookConvex();

  const latestSearchIdRef = useRef(0);
  const latestApiCallIdRef = useRef(0);
  const isFirstRemoteSearchRef = useRef(true);

  useEffect(() => {
    if (!query.trim()) {
      console.log("[useSearchLogic] Query empty, resetting isFirstRemoteSearchRef to true");
      isFirstRemoteSearchRef.current = true;
    }
  }, [query]);

  const executeRemoteSearch = useCallback(
    async (searchQuery: string, location: Location) => {
      const apiCallId = ++latestApiCallIdRef.current;
      console.log("[useSearchLogic] executeRemoteSearch EXECUTING", { searchQuery, apiCallId });
      try {
        const results = await performUnifiedSearch(searchQuery, location);
        const isLatestApiCall = apiCallId === latestApiCallIdRef.current;
        console.log("[useSearchLogic] performUnifiedSearch returned", {
          resultsCount: results.items.length,
          apiCallId,
          latestApiCallId: latestApiCallIdRef.current,
          isLatestApiCall,
        });
        if (isLatestApiCall) {
          console.log("[useSearchLogic] Setting results (latest API call)", {
            resultsCount: results.items.length,
          });
          setResults({ ...results, isRefreshing: false });
        } else {
          console.log("[useSearchLogic] SKIPPING results (newer API call in flight)", {
            apiCallId,
            latestApiCallId: latestApiCallIdRef.current,
          });
        }
      } catch (err) {
        console.error("[useSearchLogic] executeRemoteSearch error", err);
        if (apiCallId === latestApiCallIdRef.current) {
          setResults({
            header: "Search failed. Please try again.",
            items: [],
            isLoading: false,
            isRefreshing: false,
          });
        }
      }
    },
    [setResults],
  );

  const debouncedRemoteSearch = useMemo(() => {
    console.log("[useSearchLogic] debouncedRemoteSearch RECREATED");
    return debounce(
      (searchQuery: string, location: Location) => {
        console.log("[useSearchLogic] debouncedRemoteSearch FIRED", {
          searchQuery: searchQuery.slice(0, 30),
        });
        void executeRemoteSearch(searchQuery, location);
      },
      REMOTE_SEARCH_DEBOUNCE_MS,
      { leading: false, trailing: true, maxWait: REMOTE_SEARCH_MAX_WAIT_MS },
    );
  }, [executeRemoteSearch]);

  useEffect(() => {
    return () => {
      debouncedRemoteSearch.cancel();
    };
  }, [debouncedRemoteSearch]);

  const performSearch = useCallback(
    (searchQuery: string, location: Location) => {
      console.log("[useSearchLogic] performSearch CALLED (not recreated, this is normal)");
      if (!searchQuery.trim()) {
        setResults({ header: "Please enter a search term.", items: [], isLoading: false });
        return;
      }

      const searchId = ++latestSearchIdRef.current;
      console.log("[useSearchLogic] performSearch", {
        searchQuery: searchQuery.slice(0, 30),
        searchId,
      });

      if (searchQuery.includes("@")) {
        searchQuery = searchQuery.replaceAll("@", "");
      }

      const character = charactersData.find(
        (c) =>
          c.slug.toLowerCase() === searchQuery.toLowerCase() ||
          c.characterName.toLowerCase() === searchQuery.toLowerCase(),
      );

      const localResults = character
        ? findCharacterSentences(character.slug, location)
        : performCachedSearch(searchQuery, location);
      console.log("[useSearchLogic] localResults", {
        count: localResults.items.length,
        isLoading: localResults.isLoading,
      });

      if (localResults.items.length > 0) {
        console.log("[useSearchLogic] Using local results, skipping remote");
        setResults(localResults);
        return;
      }

      if (localResults.isLoading) {
        setResults(localResults);
        return;
      }

      const previousResults = useSearchModal.getState().results;
      const hasExistingResults = previousResults.items.length > 0;
      console.log("[useSearchLogic] No local results, triggering remote search", {
        hasExistingResults,
        isFirstRemote: isFirstRemoteSearchRef.current,
      });

      if (hasExistingResults) {
        console.log("[useSearchLogic] Setting isRefreshing with existing results");
        setResults({ ...previousResults, isRefreshing: true, isLoading: false });
      } else if (!isFirstRemoteSearchRef.current) {
        console.log("[useSearchLogic] Setting isRefreshing (no results yet, not first search)");
        setResults({ header: "", items: [], isLoading: false, isRefreshing: true });
      } else {
        console.log("[useSearchLogic] Setting isLoading (first search)");
        setResults({ header: "Searching…", items: [], isLoading: true });
      }

      isFirstRemoteSearchRef.current = false;
      debouncedRemoteSearch(searchQuery, location);
    },
    [setResults, debouncedRemoteSearch, charactersData],
  );

  const debouncedTriggerSearch = useMemo(() => {
    console.log("[useSearchLogic] debouncedTriggerSearch RECREATED");
    return debounce(performSearch, TYPING_DEBOUNCE_MS);
  }, [performSearch]);

  useEffect(() => {
    if (query.trim()) {
      const latestLocation = getSavedLocation();
      debouncedTriggerSearch(query, latestLocation);
    } else {
      debouncedTriggerSearch.cancel();
    }
  }, [query, debouncedTriggerSearch]);

  useEffect(() => {
    return () => {
      debouncedTriggerSearch.cancel();
    };
  }, [debouncedTriggerSearch]);
};
