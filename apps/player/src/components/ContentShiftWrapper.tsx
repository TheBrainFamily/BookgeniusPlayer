import React, { useEffect, useRef, useState } from "react";
import { useContentShift } from "@player/stores/contentShift.store";
import { getBookData } from "@player/genericBookDataGetters/getBookData";

export const ContentShiftWrapper: React.FC = () => {
  const { isContentShiftedLeft } = useContentShift();
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [isMediumScreen, setIsMediumScreen] = useState(false);
  const wasShiftedRef = useRef(false);

  const bookData = getBookData();
  const isPlayFormat = bookData.metadata.bookForm === "play" || bookData.metadata.bookForm === "mixed";

  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1280);
      setIsMediumScreen(window.innerWidth >= 1024 && window.innerWidth < 1280);
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

    // Preserve opacity transition and add transform and width transitions
    bookContainer.style.transition = `${opacityTransition}, transform 0.3s ease-out, width 0.3s ease-out, max-width 0.3s ease-out`;
    bookContainer.style.willChange = "transform, width";

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
    const resetMarginAndPadding = () => {
      bookContainer.style.marginInline = "";
      bookContainer.style.paddingLeft = "";
    };

    const handleTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName === "transform") {
        // After transform finishes, restore full size to avoid percentage re-evaluation jumps
        setFullSize();
        bookContainer.removeEventListener("transitionend", handleTransitionEnd as EventListener);
      }
    };

    const leftNotesBlank = document.getElementById("left-notes-blank");
    const leftNotes = document.getElementById("left-notes");

    if (isLargeScreen) {
      resetMarginAndPadding();

      if (isContentShiftedLeft) {
        // Entering shifted state: resize and shift content left
        setCompactSize();
        bookContainer.style.transform = `translateX(${shiftAmount})`;

        if (leftNotesBlank) {
          leftNotesBlank.style.display = "block";
        }

        if (leftNotes) {
          leftNotes.style.display = "block";
        }
      } else {
        // Leaving shifted state: animate back to center and restore full size
        bookContainer.style.transform = "translateX(0)";

        if (wasShiftedRef.current) {
          // If was shifted, wait for animation to complete before resizing
          bookContainer.addEventListener("transitionend", handleTransitionEnd as EventListener);
          setCompactSize();
        } else {
          // Not previously shifted, just ensure full size
          setFullSize();
        }

        if (leftNotesBlank) {
          leftNotesBlank.style.display = "block";
        }

        if (leftNotes) {
          leftNotes.style.display = "block";
        }
      }
    } else if (isMediumScreen) {
      bookContainer.style.transform = "translateX(0)";

      if (isContentShiftedLeft) {
        // Entering shifted state: resize container for medium screens
        bookContainer.style.width = "66%";
        bookContainer.style.maxWidth = "calc(120rem * 0.66)";
        bookContainer.style.marginInline = "unset";
        bookContainer.style.paddingLeft = "4px";

        if (leftNotesBlank) {
          leftNotesBlank.style.display = "none";
        }

        if (leftNotes) {
          leftNotes.style.display = "none";
        }
      } else {
        // Leaving shifted state: restore full size
        setFullSize();
        resetMarginAndPadding();

        if (leftNotesBlank) {
          leftNotesBlank.style.display = "block";
        }

        if (leftNotes) {
          leftNotes.style.display = "block";
        }
      }
    } else {
      // Small screens: never shift, always full size
      bookContainer.style.transform = "translateX(0)";
      setFullSize();
      resetMarginAndPadding();

      if (leftNotesBlank) {
        leftNotesBlank.style.display = "block";
      }

      if (leftNotes) {
        leftNotes.style.display = "block";
      }
    }

    // Cleanup function to reset styles on unmount
    return () => {
      bookContainer.style.transform = "";
      bookContainer.style.width = "";
      bookContainer.style.maxWidth = "";
      bookContainer.style.marginInline = "";
      bookContainer.style.paddingLeft = "";
      bookContainer.removeEventListener("transitionend", handleTransitionEnd);
    };
  }, [isContentShiftedLeft, isLargeScreen, isPlayFormat, isMediumScreen]);

  useEffect(() => {
    wasShiftedRef.current = isContentShiftedLeft;
  }, [isContentShiftedLeft]);

  // This component doesn't render anything visible
  return null;
};
