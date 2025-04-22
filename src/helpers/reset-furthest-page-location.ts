import { setCurrentLocation } from "./paragraphsNavigation";

export const resetFurthestPageLocation = () => {
  localStorage.removeItem("furthestLocation");
  setCurrentLocation({ chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0 });
  console.error("we should set to current page instead");
};
