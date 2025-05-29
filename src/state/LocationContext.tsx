import React, { createContext, useCallback, useMemo, useState, useEffect } from "react";
import { __setLocationBridge, parseLocationFromHash } from "@/helpers/paragraphsNavigation";

/* ------------------------------------------------------------------ */
export interface Location {
  chapter: number;
  paragraph: number;
  endChapter: number;
  endParagraph: number;
  currentChapter: number;
  currentParagraph: number;
}

export interface LocationWithMetadata {
  location: Location;
  timestamp: number;
  source: "user" | "system";
}

/* ------------------------------------------------------------------ */
/*  Load the *initial* reader position from LS — nothing more         */
const loadFromLS = (): Location => {
  try {
    const raw = localStorage.getItem("furthestLocation");
    return raw ? JSON.parse(raw) : { chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0, currentChapter: 0, currentParagraph: 0 };
  } catch {
    return { chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0, currentChapter: 0, currentParagraph: 0 };
  }
};

/* ------------------------------------------------------------------ */
interface LocationCtx {
  location: Location;
  lastSystemLocation: LocationWithMetadata | null;
  setLocation: (loc: Location, source?: "user" | "system") => void;
}

export const LocationContext = createContext<LocationCtx>({
  location: { chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0, currentChapter: 0, currentParagraph: 0 },
  lastSystemLocation: null,
  setLocation: () => {},
});

/* ------------------------------------------------------------------ */
export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load initial location from URL hash or localStorage
  const initialLocation = useMemo(() => {
    const hashLocation = parseLocationFromHash();
    return hashLocation || loadFromLS();
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
