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
    element.style.pointerEvents = shouldBeVisible ? "auto" : "none";

    previousVisibilityRef.current = shouldBeVisible;
  }, [shouldBeVisible, lastHideReason]);

  return (
    <div
      onMouseEnter={() => pauseAllTimers()}
      onMouseLeave={() => startAllTimers()}
      ref={elementRef}
      className={cn("transition-opacity", className)}
      style={{ opacity: shouldBeVisible ? 1 : 0, pointerEvents: shouldBeVisible ? "auto" : "none" }}
      {...props}
    >
      {children}
    </div>
  );
};
