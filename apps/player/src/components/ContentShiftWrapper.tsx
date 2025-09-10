import React, { useEffect, useState } from "react";
import { useContentShift } from "@player/stores/contentShift.store";
import { getBookData } from "@player/genericBookDataGetters/getBookData";

export const ContentShiftWrapper: React.FC = () => {
  const { isContentShiftedLeft } = useContentShift();
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  const bookData = getBookData();
  const isPlayFormat = bookData.metadata.bookForm === "play";

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

    // Store original transition to preserve it
    const computedStyles = window.getComputedStyle(bookContainer);
    const originalTransition = computedStyles.transition;

    // Extract existing opacity transition if present, otherwise use default
    const opacityTransition =
      originalTransition
        .split(",")
        .find((t) => t.trim().startsWith("opacity"))
        ?.trim() || "opacity 1000ms ease-in-out";

    // Preserve opacity transition and add transform transition
    bookContainer.style.transition = `${opacityTransition}, transform 0.3s ease-out`;

    // Only apply content shift on large screens (≥1280px)
    if (isContentShiftedLeft && isLargeScreen) {
      // Shift content left by adding transform and adjusting layout
      bookContainer.style.transform = isPlayFormat ? "translateX(-18%)" : "translateX(-13%)";
      bookContainer.style.width = "80%";
      bookContainer.style.maxWidth = "calc(120rem * 0.8)";
    } else {
      // Reset to original position for small screens or when not shifted
      bookContainer.style.transform = "translateX(0)";
      bookContainer.style.width = "100%";
      bookContainer.style.maxWidth = "120rem";
    }

    // Cleanup function to reset on unmount
    return () => {
      bookContainer.style.transition = "";
      bookContainer.style.transform = "";
      bookContainer.style.width = "";
      bookContainer.style.maxWidth = "";
    };
  }, [isContentShiftedLeft, isLargeScreen, isPlayFormat]);

  // This component doesn't render anything visible
  return null;
};
