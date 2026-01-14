import {
  setCurrentLocation,
  getCurrentLocation,
  getFurthestLocationKey,
} from "./paragraphsNavigation";

export const resetFurthestPageLocation = () => {
  localStorage.removeItem(getFurthestLocationKey());
  const currentLocation = getCurrentLocation();
  setCurrentLocation(currentLocation);

  // This is a workaround to ensure the button hides immediately
  window.dispatchEvent(new Event("furthestLocationReset"));
};
