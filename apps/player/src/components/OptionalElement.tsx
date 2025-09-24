import React, { useEffect, useRef, useState } from "react";

import { useOptionalElementVisibility, useLastHideReason, useElementVisibilityStore } from "@player/stores/elementVisibility.store";

interface OptionalElementProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const OptionalElement: React.FC<OptionalElementProps> = ({ children, className, ...props }) => {
  const pauseAllTimers = useElementVisibilityStore((state) => state.pauseAllTimers);
  const startAllTimers = useElementVisibilityStore((state) => state.startAllTimers);

  const shouldBeVisible = useOptionalElementVisibility();
  const lastHideReason = useLastHideReason();
  const elementRef = useRef<HTMLDivElement>(null);
  const previousVisibilityRef = useRef<boolean>(shouldBeVisible);

  // Local state for hover visibility
  const [isHovered, setIsHovered] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Check if screen is wide enough for hover effects (desktop)
  const isDesktopWidth = () => window.innerWidth >= 1024;

  // Track desktop/mobile state
  useEffect(() => {
    const updateDesktopState = () => {
      setIsDesktop(isDesktopWidth());
    };

    updateDesktopState(); // Initial check
    window.addEventListener("resize", updateDesktopState);
    return () => window.removeEventListener("resize", updateDesktopState);
  }, []);

  // Reset hover state when window becomes too narrow
  useEffect(() => {
    if (!isDesktop && isHovered) {
      setIsHovered(false);
      startAllTimers(); // Resume timers when forcibly clearing hover
    }
  }, [isDesktop, isHovered, startAllTimers]);

  // Determine if element should be visible
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const currentlyVisible = shouldBeVisible || isHovered;
    const isBecomingVisible = currentlyVisible && !previousVisibilityRef.current;
    const isBecomingHidden = !currentlyVisible && previousVisibilityRef.current;

    // Reset animation when hover state changes OR when becoming visible
    if (isBecomingVisible || (isHovered && !previousVisibilityRef.current)) {
      // Reset transition first to interrupt any ongoing animation
      element.style.transition = "none";
      // Force reflow to apply the reset
      void element.offsetHeight;
      // Now set the fast transition for showing
      element.style.transition = `opacity 0.3s ease-in-out`;
    } else if (isBecomingHidden) {
      // Different transition durations based on hide reason
      if (lastHideReason === "inactivity" && !isHovered) {
        element.style.transition = `opacity 4s ease-in-out`;
      } else {
        // Fast hiding for tap or other reasons, or when hover ends
        element.style.transition = `opacity 0.3s ease-in-out`;
      }
    }

    element.style.opacity = currentlyVisible ? "1" : "0";
    previousVisibilityRef.current = currentlyVisible;
  }, [shouldBeVisible, lastHideReason, isHovered]);

  const handleMouseEnter = () => {
    // Only enable hover effects on desktop-width screens
    if (!isDesktop) return;

    setIsHovered(true);
    pauseAllTimers();
  };

  const handleMouseLeave = () => {
    // Only process mouse leave if we're on desktop-width screens
    if (!isDesktop) return;

    setIsHovered(false);

    startAllTimers();
  };

  // Element is visible if it should be visible globally OR if it's being hovered over
  const isElementVisible = shouldBeVisible || isHovered;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      ref={elementRef}
      className={className}
      aria-hidden={!isElementVisible}
      style={{
        // Always allow pointer events on desktop, and on mobile only disable when truly hidden
        pointerEvents: isDesktop ? "auto" : shouldBeVisible || isHovered ? "auto" : "none",
      }}
      {...props}
    >
      {children}
    </div>
  );
};
