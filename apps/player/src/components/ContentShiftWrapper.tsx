import React, { useEffect, useState } from "react";
import { useContentShift } from "@player/stores/contentShift.store";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { isMobileOrTablet } from "@player/utils/isMobileOrTablet";

/**
 * ContentShiftWrapper - Layout management for side-panel modals (Search, DeepResearch)
 *
 * The modals are portaled directly into the column containers:
 * - 2-COLUMN (1024-1279px): Modal portals into #left-notes
 * - 3-COLUMN (≥1280px): Modal portals into #right-notes
 *
 * This component handles:
 * - 2-column: Adding a class to hide original left-notes content (characters)
 * - 3-column: Optionally squeezing left column on narrower screens
 * - Play format: Transform-based shifting (legacy behavior)
 */
const getInitialScreenSizes = () => {
  if (typeof window === "undefined") {
    return { large: false, medium: false, wide: false };
  }
  const width = window.innerWidth;
  return { large: width >= 1280, medium: width >= 1024 && width < 1280, wide: width >= 1500 };
};

export const ContentShiftWrapper: React.FC = () => {
  const { isContentShiftedLeft } = useContentShift();

  const [isLargeScreen, setIsLargeScreen] = useState(() => getInitialScreenSizes().large);
  const [isMediumScreen, setIsMediumScreen] = useState(() => getInitialScreenSizes().medium);
  const [isWideScreen, setIsWideScreen] = useState(() => getInitialScreenSizes().wide);

  const bookData = getBookData();
  const isPlayFormat = bookData.metadata.bookForm === "play" || bookData.metadata.bookForm === "mixed";
  const isMobileOrTabletDevice = isMobileOrTablet();

  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsLargeScreen(width >= 1280);
      setIsMediumScreen(width >= 1024 && width < 1280);
      setIsWideScreen(width >= 1500);
    };

    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  useEffect(() => {
    const bookContainer = document.getElementById("book-container");
    const leftNotes = document.getElementById("left-notes");
    const leftNotesBlank = document.getElementById("left-notes-blank");
    const rightNotes = document.getElementById("right-notes");

    if (!bookContainer) return;

    // Reset function - removes all classes and inline styles
    const resetLayout = () => {
      leftNotes?.classList.remove("side-panel-active");
      leftNotes?.classList.remove("content-hidden");
      rightNotes?.classList.remove("side-panel-active");
      if (leftNotes) {
        leftNotes.style.flex = "";
        leftNotes.style.overflow = "";
      }
      if (leftNotesBlank) {
        leftNotesBlank.style.flex = "";
      }
      bookContainer.style.transform = "";
    };

    if (!isContentShiftedLeft) {
      resetLayout();
      return;
    }

    // 3-COLUMN LAYOUT (large screens ≥1280px)
    // Modal is portaled into #right-notes - characters stay visible in left-notes
    if (isLargeScreen && !isPlayFormat) {
      rightNotes?.classList.add("side-panel-active");

      // On narrower 3-column screens, squeeze left column to give modal more room
      if (!isWideScreen) {
        if (leftNotes) {
          leftNotes.style.flex = "0 0 100px";
          leftNotes.style.overflow = "hidden";
        }
        if (leftNotesBlank) {
          leftNotesBlank.style.flex = "0 0 100px";
        }
      }
    }
    // 2-COLUMN LAYOUT (medium screens 1024-1279px)
    // Modal is portaled into #left-notes - hide original content via CSS class
    else if (isMediumScreen && !isPlayFormat) {
      leftNotes?.classList.add("side-panel-active");
    }
    // PLAY FORMAT: Use transform-based shifting (legacy behavior)
    else if (isPlayFormat && (isLargeScreen || isMediumScreen)) {
      const shiftAmount = isLargeScreen ? "-15%" : "-20%";
      bookContainer.style.transform = `translateX(${shiftAmount})`;
    }

    return resetLayout;
  }, [isContentShiftedLeft, isLargeScreen, isMediumScreen, isWideScreen, isPlayFormat]);

  // Apply mobileOrTablet class for tablet-specific layout adjustments
  // This collapses right-notes and sets consistent max-widths (see styles.css)
  useEffect(() => {
    const playerScope = document.getElementById("player-scope");
    if (!playerScope) return;

    if (isMobileOrTabletDevice && !isPlayFormat) {
      playerScope.classList.add("mobileOrTablet");
    } else {
      playerScope.classList.remove("mobileOrTablet");
    }

    return () => {
      playerScope.classList.remove("mobileOrTablet");
    };
  }, [isMobileOrTabletDevice, isPlayFormat]);

  return null;
};
