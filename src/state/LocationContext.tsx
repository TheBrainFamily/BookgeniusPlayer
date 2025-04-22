import React, { createContext, useCallback, useMemo, useState } from "react";
import { __setLocationBridge } from "@/src/helpers/paragraphsNavigation";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
export interface Location {
  chapter: number;
  paragraph: number;
  endChapter: number;
  endParagraph: number;
}
interface LocationCtx {
  location: Location;
  setLocation: (l: Location) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
const loadFromLS = (): Location => {
  const raw = localStorage.getItem("furthestLocation");
  return raw ? JSON.parse(raw) : { chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0 };
};
const saveToLS = (loc: Location) => localStorage.setItem("furthestLocation", JSON.stringify(loc));

/* ------------------------------------------------------------------ */
/*  Context + Provider                                                */
/* ------------------------------------------------------------------ */
export const LocationContext = createContext<LocationCtx>({
  location: { chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0 },
  // eslint‑disable-next-line @typescript-eslint/no-empty-function
  setLocation: () => {},
});

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocationState] = useState<Location>(loadFromLS());

  /* make sure we write to LS only once per state change */
  const setLocation = useCallback((loc: Location) => {
    setLocationState(loc);
    saveToLS(loc);
  }, []);

  /* ----------------------------------------------------------------
   *  expose the current getters / setters to legacy code
   * ---------------------------------------------------------------- */
  __setLocationBridge({ get: () => location, set: setLocation });

  const value = useMemo<LocationCtx>(() => ({ location, setLocation }), [location, setLocation]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

/* ------------------------------------------------------------------ */
/*  Convenience hook                                                  */
/* ------------------------------------------------------------------ */
export const useLocation = () => React.useContext(LocationContext);
