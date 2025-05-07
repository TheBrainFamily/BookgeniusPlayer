import { setCurrentLocation, getCurrentLocation } from "./paragraphsNavigation";

export const resetFurthestPageLocation = () => {
  localStorage.removeItem("furthestLocation");
  const currentLocation = getCurrentLocation();
  setCurrentLocation(currentLocation);
};
