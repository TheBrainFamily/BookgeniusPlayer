import React, { useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useEscapeKey } from "@player/hooks/useEscapeKey";
import DeepResearchModal from "@player/components/modals/ResearchModal";
import { useDeepResearchModal } from "@player/stores/modals/researchModal.store";
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

export const DeepResearchModalRenderer: React.FC = () => {
  const { isOpen, content, hideOverlay, isLoading, closeModal, showDiveDeeperCTA, isDiveDeeperLoading, diveDeeperHandler, type } = useDeepResearchModal();
  const { isLargeScreen, isMediumScreen } = useScreenSize();
  const isMobile = useIsMobileOrTablet();
  const { enableContentShift, disableContentShift } = useContentShift();
  const { isPlayFormat } = useBookForm();

  useEscapeKey(isOpen, closeModal);

  // Determine if we're using side-panel mode (injected into column) vs centered modal
  // Play format uses centered modal because left/right notes are hidden
  const isSidePanel = !isMobile && !isPlayFormat && (isLargeScreen || isMediumScreen);

  // Enable content shift when modal is open in side-panel mode
  useEffect(() => {
    if (isOpen && isSidePanel) {
      enableContentShift();
    }
    return () => {
      if (isSidePanel) {
        disableContentShift();
      }
    };
  }, [isOpen, isSidePanel, enableContentShift, disableContentShift]);

  const container = useMemo(() => getModalContainer(isMobile, isPlayFormat, isLargeScreen, isMediumScreen), [isMobile, isPlayFormat, isLargeScreen, isMediumScreen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <DeepResearchModal
          onClose={closeModal}
          content={content}
          layoutView={isSidePanel}
          hideOverlay={hideOverlay}
          isLoading={isLoading}
          canDiveDeeper={showDiveDeeperCTA}
          onDiveDeeper={diveDeeperHandler}
          isDiveDeeperLoading={isDiveDeeperLoading}
          type={type}
          isSidePanel={isSidePanel}
        />
      )}
    </AnimatePresence>,
    container,
  );
};
