import React, { useEffect, useState } from "react";
import { useContentShift } from "@player/stores/contentShift.store";
import { useBookConvex } from "@player/context/BookConvexContext";
import { useIsMobileOrTablet } from "@player/hooks/useIsMobileOrTablet";

/**
 * ContentShiftWrapper - Layout management for side-panel modals (Search, DeepResearch)
 *
 * The modals are portaled directly into the column containers:
 * - 2-COLUMN (1024-1279px): Modal portals into #left-notes
 * - 3-COLUMN (≥1280px): Modal portals into #right-notes
 *
 * This component handles:
 * - 2-column: Hide left-notes content, modal replaces it, lock width
 * - 3-column narrow (1280-1600px): Collapse left-notes, modal in right (CSS handles fixed width)
 * - 3-column wide (≥1600px): Characters stay visible, modal in right
 * - Play format: Transform-based shifting (legacy behavior)
 */
const getInitialScreenSizes = () => {
  if (typeof window === "undefined") {
    return { large: false, medium: false, wide: false };
  }
  const width = window.innerWidth;
  return { large: width >= 1280, medium: width >= 1024 && width < 1280, wide: width >= 1600 };
};

export const ContentShiftWrapper: React.FC = () => {
  const { isContentShiftedLeft } = useContentShift();

  const [isLargeScreen, setIsLargeScreen] = useState(() => getInitialScreenSizes().large);
  const [isMediumScreen, setIsMediumScreen] = useState(() => getInitialScreenSizes().medium);
  const [isWideScreen, setIsWideScreen] = useState(() => getInitialScreenSizes().wide);

  const { bookData } = useBookConvex();
  const isPlayFormat = bookData?.metadata?.bookForm === "play" || bookData?.metadata?.bookForm === "mixed";
  const isMobileOrTabletDevice = useIsMobileOrTablet();

  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsLargeScreen(width >= 1280);
      setIsMediumScreen(width >= 1024 && width < 1280);
      setIsWideScreen(width >= 1600);
    };

    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  useEffect(() => {
    const bookContainer = document.getElementById("book-container");
    const leftNotes = document.getElementById("left-notes");
    const rightNotes = document.getElementById("right-notes");
    const contentContainer = document.getElementById("content-container");

    if (!bookContainer) return;

    // Reset function - removes all classes and inline styles
    const resetLayout = () => {
      leftNotes?.classList.remove("side-panel-active");
      leftNotes?.classList.remove("collapsed");
      rightNotes?.classList.remove("side-panel-active");
      contentContainer?.classList.remove("modal-open");
      contentContainer?.style.removeProperty("--content-width");
      bookContainer.style.transform = "";
    };

    if (!isContentShiftedLeft) {
      resetLayout();
      return;
    }

    // Lock content container width - only needed for 2-column layout
    // where hiding left-notes content could cause flex recalculation
    const lockContentWidth = () => {
      if (!contentContainer) return;
      const { width } = contentContainer.getBoundingClientRect();
      // Guard against capturing zero width during intermediate layout states
      if (!width || width <= 0) return;
      contentContainer.style.setProperty("--content-width", `${width}px`);
      contentContainer.classList.add("modal-open");
    };

    // 3-COLUMN LAYOUT (large screens ≥1280px)
    // Modal is portaled into #right-notes
    if (isLargeScreen && !isPlayFormat) {
      rightNotes?.classList.add("side-panel-active");
      // On narrower 3-column screens (1280-1600px), hide left column to give modal more room
      // Don't lock content width here - the collapse/expand should be symmetric
      if (!isWideScreen) {
        leftNotes?.classList.add("collapsed");
      }
    }
    // 2-COLUMN LAYOUT (medium screens 1024-1279px)
    // Modal is portaled into #left-notes - hide original content via CSS class
    // Lock width to prevent jump when left column content is hidden
    else if (isMediumScreen && !isPlayFormat) {
      lockContentWidth();
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
