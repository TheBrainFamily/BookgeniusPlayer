import React, { useEffect, useRef } from "react";

import { useOptionalElementVisibility, useLastHideReason, useElementVisibilityStore } from "@player/stores/elementVisibility.store";
import { cn } from "@player/lib/utils";

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
  const [isHovered, setIsHovered] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);

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
  // Optional elements should only be visible when explicitly shown, NOT during scroll mode

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const isBecomingVisible = shouldBeVisible && !previousVisibilityRef.current;
    const isBecomingHidden = !shouldBeVisible && previousVisibilityRef.current;

    if (isBecomingVisible) {
      element.style.transition = `opacity 0.3s ease-in-out`;
    } else if (isBecomingHidden) {
      // Different transition durations based on hide reason
      if (lastHideReason === "inactivity") {
        element.style.transition = `opacity 4s ease-in-out`;
      } else {
        // Fast hiding for tap or other reasons
        element.style.transition = `opacity 0.3s ease-in-out`;
      }
    }

    element.style.opacity = shouldBeVisible ? "1" : "0";
    // Removed imperative pointer-events setting - will be handled in JSX based on visibility

    previousVisibilityRef.current = shouldBeVisible;
  }, [shouldBeVisible, lastHideReason]);

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
      className={cn("transition-opacity", className)}
      aria-hidden={!isElementVisible}
      style={{
        opacity: isElementVisible ? 1 : 0,
        // Always allow pointer events on desktop, and on mobile only disable when truly hidden
        pointerEvents: isDesktop ? "auto" : shouldBeVisible || isHovered ? "auto" : "none",
      }}
      {...props}
    >
      {children}
    </div>
  );
};
