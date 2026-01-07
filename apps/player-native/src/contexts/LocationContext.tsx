import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { type Location, DEFAULT_LOCATION } from "@player-native/types/location";

interface LocationContextValue {
  location: Location;
  setLocation: (loc: Location) => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocationState] = useState<Location>(DEFAULT_LOCATION);

  const setLocation = useCallback((loc: Location) => {
    setLocationState((prev) => {
      // Only update if something meaningful changed
      if (
        prev.chapter === loc.chapter &&
        prev.paragraph === loc.paragraph &&
        prev.currentChapter === loc.currentChapter &&
        prev.currentParagraph === loc.currentParagraph
      ) {
        return prev;
      }
      return loc;
    });
  }, []);

  const value = useMemo(() => ({ location, setLocation }), [location, setLocation]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

export const useLocation = () => {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error("useLocation must be used within LocationProvider");
  }
  return ctx;
};
