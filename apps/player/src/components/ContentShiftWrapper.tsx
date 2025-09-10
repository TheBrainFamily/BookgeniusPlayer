import React, { useEffect, useRef, useState } from "react";
import { useContentShift } from "@player/stores/contentShift.store";
import { getBookData } from "@player/genericBookDataGetters/getBookData";

export const ContentShiftWrapper: React.FC = () => {
  const { isContentShiftedLeft } = useContentShift();
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const wasShiftedRef = useRef(false);

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
    bookContainer.style.willChange = "transform";

    // Only apply content shift on large screens (≥1280px)
    const shiftAmount = isPlayFormat ? "-18%" : "-13%";
    const setCompactSize = () => {
      bookContainer.style.width = "80%";
      bookContainer.style.maxWidth = "calc(120rem * 0.8)";
    };
    const setFullSize = () => {
      bookContainer.style.width = "100%";
      bookContainer.style.maxWidth = "120rem";
    };

    if (isLargeScreen) {
      if (isContentShiftedLeft) {
        // Entering shifted state: size first, then transform to avoid jumps
        setCompactSize();
        bookContainer.style.transform = `translateX(${shiftAmount})`;
      } else {
        // Leaving shifted state: keep compact size while transform animates back to 0
        if (wasShiftedRef.current) {
          setCompactSize();
          const handleTransitionEnd = (e: TransitionEvent) => {
            if (e.propertyName === "transform") {
              // After transform finishes, restore full size to avoid percentage re-evaluation jumps
              setFullSize();
              bookContainer.removeEventListener("transitionend", handleTransitionEnd as EventListener);
            }
          };
          bookContainer.addEventListener("transitionend", handleTransitionEnd as EventListener);
          bookContainer.style.transform = "translateX(0)";
        } else {
          // Not previously shifted, ensure full size and no transform
          bookContainer.style.transform = "translateX(0)";
          setFullSize();
        }
      }
    } else {
      // Small screens: never shift
      bookContainer.style.transform = "translateX(0)";
      setFullSize();
    }

    // Cleanup function to reset on unmount
    return () => {
      bookContainer.style.transition = "";
      bookContainer.style.transform = "";
      bookContainer.style.width = "";
      bookContainer.style.maxWidth = "";
      bookContainer.style.willChange = "";
    };

    // Track previous shifted state for sequencing logic
  }, [isContentShiftedLeft, isLargeScreen, isPlayFormat]);

  useEffect(() => {
    wasShiftedRef.current = isContentShiftedLeft;
  }, [isContentShiftedLeft]);

  // This component doesn't render anything visible
  return null;
};
