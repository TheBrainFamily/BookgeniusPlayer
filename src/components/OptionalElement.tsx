import React, { useEffect, useRef } from "react";

import { useOptionalElementVisibility, useLastHideReason, useElementVisibilityStore } from "@/stores/elementVisibility.store";
import { cn } from "@/lib/utils";

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
    // Always allow pointer events so hover functionality works even when element is invisible
    element.style.pointerEvents = "auto";

    previousVisibilityRef.current = shouldBeVisible;
  }, [shouldBeVisible, lastHideReason]);

  const handleMouseEnter = () => {
    console.log("handleMouseEnter");
    setIsHovered(true);
    pauseAllTimers();
  };

  const handleMouseLeave = () => {
    console.log("handleMouseLeave");
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
      style={{ opacity: isElementVisible ? 1 : 0, pointerEvents: "auto" }}
      {...props}
    >
      {children}
    </div>
  );
};
