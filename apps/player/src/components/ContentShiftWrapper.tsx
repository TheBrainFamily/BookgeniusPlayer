import React, { useEffect } from "react";
import { useContentShift } from "@player/stores/contentShift.store";

export const ContentShiftWrapper: React.FC = () => {
  const { isContentShiftedLeft } = useContentShift();

  useEffect(() => {
    const bookContainer = document.getElementById("book-container");
    if (!bookContainer) return;

    if (isContentShiftedLeft) {
      // Shift content left by adding transform and adjusting layout
      bookContainer.style.transform = "translateX(-25%)";
      bookContainer.style.transition = "transform 0.3s ease-in-out";
      bookContainer.style.width = "75%";
      bookContainer.style.maxWidth = "calc(120rem * 0.75)";
    } else {
      // Reset to original position
      bookContainer.style.transform = "translateX(0)";
      bookContainer.style.transition = "transform 0.3s ease-in-out";
      bookContainer.style.width = "100%";
      bookContainer.style.maxWidth = "120rem";
    }

    // Cleanup function to reset on unmount
    return () => {
      bookContainer.style.transform = "";
      bookContainer.style.transition = "";
      bookContainer.style.width = "";
      bookContainer.style.maxWidth = "";
    };
  }, [isContentShiftedLeft]);

  // This component doesn't render anything visible
  return null;
};
