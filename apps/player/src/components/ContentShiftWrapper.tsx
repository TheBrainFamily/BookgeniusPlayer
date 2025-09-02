import React, { useEffect, useState } from "react";
import { useContentShift } from "@player/stores/contentShift.store";

export const ContentShiftWrapper: React.FC = () => {
  const { isContentShiftedLeft } = useContentShift();
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1280);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  useEffect(() => {
    const bookContainer = document.getElementById("book-container");
    if (!bookContainer) return;

    // Only apply content shift on large screens (≥1280px)
    if (isContentShiftedLeft && isLargeScreen) {
      // Shift content left by adding transform and adjusting layout
      bookContainer.style.transform = "translateX(-20%)";
      bookContainer.style.transition = "transform 0.3s ease-in-out";
      bookContainer.style.width = "75%";
      bookContainer.style.maxWidth = "calc(120rem * 0.75)";
    } else {
      // Reset to original position for small screens or when not shifted
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
  }, [isContentShiftedLeft, isLargeScreen]);

  // This component doesn't render anything visible
  return null;
};
