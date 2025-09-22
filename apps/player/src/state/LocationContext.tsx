import React, { createContext, useCallback, useMemo, useState, useEffect } from "react";
import { __setLocationBridge, parseLocationFromHash, getSavedLocation } from "@player/helpers/paragraphsNavigation";

/* ------------------------------------------------------------------ */
export interface Location {
  chapter: number;
  paragraph: number;
  endChapter: number;
  endParagraph: number;
  currentChapter: number;
  currentParagraph: number;
  lastScrollTimestamp?: number;
  earliestVisibleParagraph: number | null;
  latestVisibleParagraph: number | null;
  earliestVisibleChapter: number | null;
  latestVisibleChapter: number | null;
}

export interface LocationWithMetadata {
  location: Location;
  timestamp: number;
  source: "user" | "system";
}

export const DEFAULT_LOCATION: Location = {
  chapter: 1,
  paragraph: 0,
  endChapter: 1,
  endParagraph: 0,
  currentChapter: 1,
  currentParagraph: 0,
  earliestVisibleParagraph: null,
  latestVisibleParagraph: null,
  earliestVisibleChapter: null,
  latestVisibleChapter: null,
};

/* ------------------------------------------------------------------ */
/*  Load the *initial* reader position from LS — nothing more         */
const loadFromLS = (): Location => {
  try {
    return getSavedLocation() || DEFAULT_LOCATION;
  } catch {
    return DEFAULT_LOCATION;
  }
};

/* ------------------------------------------------------------------ */
interface LocationCtx {
  location: Location;
  lastSystemLocation: LocationWithMetadata | null;
  setLocation: (loc: Location, source?: "user" | "system") => void;
}

export const LocationContext = createContext<LocationCtx>({ location: DEFAULT_LOCATION, lastSystemLocation: null, setLocation: () => {} });

/* ------------------------------------------------------------------ */
export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load initial location from URL hash or localStorage
  const initialLocation = useMemo(() => {
    const hashLocation = parseLocationFromHash();
    return hashLocation || loadFromLS() || DEFAULT_LOCATION;
  }, []);

  const [location, setLocationState] = useState<Location>(initialLocation);
  const [lastSystemLocation, setLastSystemLocation] = useState<LocationWithMetadata | null>(null);

  const setLocation = useCallback((loc: Location, source: "user" | "system" = "user") => {
    setLocationState(loc);

    // Track system-driven location changes
    if (source === "system") {
      setLastSystemLocation({ location: loc, timestamp: Date.now(), source: "system" });
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Sync internal bridge                                              */
  useEffect(() => {
    __setLocationBridge({ get: () => location, set: (loc, source = "user") => setLocation(loc, source) });
  }, [location, setLocation]);

  /* ------------------------------------------------------------------ */
  const value = useMemo(() => ({ location, lastSystemLocation, setLocation }), [location, lastSystemLocation, setLocation]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

/* ------------------------------------------------------------------ */
export const useLocation = () => {
  const ctx = React.useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
};
