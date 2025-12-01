import React, { useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";

import { useSearchModal } from "@player/stores/modals/searchModal.store";
import { SearchModal } from "@player/components/modals/SearchModal";
import { useSearchLogic } from "./useSearchLogic";
import { useEscapeKey } from "@player/hooks/useEscapeKey";
import { useScreenSize } from "@player/hooks/useScreenSize";
import { useIsMobileOrTablet } from "@player/hooks/useIsMobileOrTablet";
import { useContentShift } from "@player/stores/contentShift.store";
import { useBookForm } from "@player/hooks/useBookForm";

const getModalContainer = (isMobile: boolean, isPlayFormat: boolean, isLargeScreen: boolean, isMediumScreen: boolean): HTMLElement => {
  if (typeof window === "undefined") return document.body;

  // Mobile or play format: centered modal in body
  if (isMobile || isPlayFormat) return document.body;

  // 3-column (≥1280px): render into right-notes
  if (isLargeScreen) {
    return document.getElementById("right-notes") || document.body;
  }

  // 2-column (1024-1279px): render into left-notes
  if (isMediumScreen) {
    return document.getElementById("left-notes") || document.body;
  }

  // Fallback to body
  return document.body;
};

export const SearchModalRenderer: React.FC = () => {
  const { isOpen, results, closeModal, lastClickedAppearanceId, query } = useSearchModal();
  const { isLargeScreen, isMediumScreen } = useScreenSize();
  const isMobile = useIsMobileOrTablet();
  const { enableContentShift, disableContentShift } = useContentShift();
  const { isPlayFormat } = useBookForm();

  // Initialize search logic (handles debounced search)
  useSearchLogic();
  useEscapeKey(isOpen, closeModal);

  // Determine if we're using side-panel mode (injected into column) vs centered modal
  // Play format uses centered modal because left/right notes are hidden
  const isSidePanel = !isMobile && !isPlayFormat && (isLargeScreen || isMediumScreen);

  // Enable content shift when modal opens in side-panel mode
  useEffect(() => {
    if (isOpen && isSidePanel) {
      enableContentShift();
    }
  }, [isOpen, isSidePanel, enableContentShift]);

  // Disable content shift after exit animation completes
  const handleExitComplete = useCallback(() => {
    if (isSidePanel) {
      disableContentShift();
    }
  }, [isSidePanel, disableContentShift]);

  const container = useMemo(() => getModalContainer(isMobile, isPlayFormat, isLargeScreen, isMediumScreen), [isMobile, isPlayFormat, isLargeScreen, isMediumScreen]);

  return createPortal(
    <AnimatePresence mode="wait" initial={false} onExitComplete={handleExitComplete}>
      {isOpen && (
        <SearchModal
          key="search-modal"
          onClose={closeModal}
          layoutView={isSidePanel}
          searchResults={results}
          clickedAppearanceId={lastClickedAppearanceId}
          searchQuery={query}
          isSidePanel={isSidePanel}
        />
      )}
    </AnimatePresence>,
    container,
  );
};
