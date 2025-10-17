import React, { useEffect, useRef, useState } from "react";
import { useContentShift } from "@player/stores/contentShift.store";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { onResizeOrOrientationChange } from "@player/helpers/paragraphsNavigation";

// Helper to toggle notes visibility
const setNotesVisibility = (visible: boolean) => {
  const leftNotesBlank = document.getElementById("left-notes-blank");
  const leftNotes = document.getElementById("left-notes");

  const displayValue = visible ? "" : "none";

  if (leftNotesBlank) leftNotesBlank.style.display = displayValue;
  if (leftNotes) leftNotes.style.display = displayValue;
};

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
      if (e.propertyName !== "transform") return;

      setFullSize();
      bookContainer.removeEventListener("transitionend", handleTransitionEnd as EventListener);
    };

    const applyLargeScreenLayout = () => {
      resetMarginAndPadding();

      if (isContentShiftedLeft) {
        setCompactSize();
        bookContainer.style.transform = `translateX(${shiftAmount})`;
        setNotesVisibility(true);
      } else {
        bookContainer.style.transform = "translateX(0)";

        if (wasShiftedRef.current) {
          bookContainer.addEventListener("transitionend", handleTransitionEnd as EventListener);
          setCompactSize();
        } else {
          setFullSize();
        }

        setNotesVisibility(true);
      }
    };

    const applyMediumScreenLayout = () => {
      bookContainer.style.transform = "translateX(0)";

      if (isContentShiftedLeft) {
        bookContainer.style.width = "66%";
        bookContainer.style.maxWidth = "calc(120rem * 0.66)";
        bookContainer.style.marginInline = "unset";
        bookContainer.style.paddingLeft = "4px";
        setNotesVisibility(false);
      } else {
        setFullSize();
        resetMarginAndPadding();
        setNotesVisibility(true);
      }
    };

    const applySmallScreenLayout = () => {
      bookContainer.style.transform = "translateX(0)";
      setFullSize();
      resetMarginAndPadding();
      setNotesVisibility(true);
    };

    // Apply layout based on screen size
    if (isLargeScreen) {
      applyLargeScreenLayout();
    } else if (isMediumScreen) {
      applyMediumScreenLayout();
    } else {
      applySmallScreenLayout();
    }

    const timeoutId = setTimeout(() => {
      onResizeOrOrientationChange();
    }, 500);

    // Cleanup function to reset styles on unmount
    return () => {
      clearTimeout(timeoutId);
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

  return null;
};
