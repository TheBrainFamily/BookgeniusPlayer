import React, { createContext, useCallback, useMemo, useState, useEffect } from "react";
import { __setLocationBridge } from "@/helpers/paragraphsNavigation";

/* ------------------------------------------------------------------ */
export interface Location {
  chapter: number;
  paragraph: number;
  endChapter: number;
  endParagraph: number;
  currentChapter: number;
  currentParagraph: number;
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
  setLocation: (l: Location) => void;
}
export const LocationContext = createContext<LocationCtx>({
  location: { chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0, currentChapter: 0, currentParagraph: 0 },

  setLocation: () => {},
});

/* ------------------------------------------------------------------ */
export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocationState] = useState<Location>(loadFromLS());

  const setLocation = useCallback((loc: Location) => {
    setLocationState(loc);
  }, []);

  /* ----------------------------------------------------------------
   * Expose getters/setters to the legacy proxy so old helpers keep
   * working transparently.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    __setLocationBridge({ get: () => location, set: setLocation });
  }, [location, setLocation]);

  const ctxValue = useMemo<LocationCtx>(() => ({ location, setLocation }), [location, setLocation]);

  return <LocationContext.Provider value={ctxValue}>{children}</LocationContext.Provider>;
};

/* convenience hook */
export const useLocation = () => React.useContext(LocationContext);
