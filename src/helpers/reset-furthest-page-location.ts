import { setCurrentLocation } from "./paragraphsNavigation";

export const resetFurthestPageLocation = () => {
  localStorage.removeItem("furthestLocation");
  setCurrentLocation({ chapter: 0, paragraph: 0 });
};
