import { getSavedLocation } from "@/helpers/paragraphsNavigation";
import { useState, useEffect } from "react";
import { useLocation } from "@/state/LocationContext";

export const useSavedLocation = () => {
  const { location } = useLocation();
  const [savedLocation, setSavedLocation] = useState(() => getSavedLocation());

  useEffect(() => {
    const newSavedLocation = getSavedLocation();
    setSavedLocation(newSavedLocation);
  }, [location]);

  useEffect(() => {
    const handleFurthestLocationReset = () => {
      setSavedLocation(getSavedLocation());
    };

    window.addEventListener("furthestLocationReset", handleFurthestLocationReset);
    return () => {
      window.removeEventListener("furthestLocationReset", handleFurthestLocationReset);
    };
  }, []);

  return { location, savedLocation };
};
