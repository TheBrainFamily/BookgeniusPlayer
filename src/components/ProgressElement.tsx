import React, { useEffect, useRef } from "react";
import { useProgressElementVisibility } from "@/stores/elementVisibility.store";
import { cn } from "@/lib/utils";

interface ProgressElementProps {
  children: React.ReactNode;
  className?: string;
}

export const ProgressElement: React.FC<ProgressElementProps> = ({ children, className }) => {
  const shouldBeVisible = useProgressElementVisibility();
  const elementRef = useRef<HTMLDivElement>(null);
  const previousVisibilityRef = useRef<boolean>(true);

  // Progress indicator should be visible when elements are visible OR when scrolling

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const isBecomingVisible = shouldBeVisible && !previousVisibilityRef.current;
    const isBecomingHidden = !shouldBeVisible && previousVisibilityRef.current;

    if (isBecomingVisible) {
      element.style.transition = "opacity 0.2s ease-in-out";
    } else if (isBecomingHidden) {
      element.style.transition = "opacity 3s ease-in-out";
    }

    element.style.opacity = shouldBeVisible ? "1" : "0";
    element.style.pointerEvents = shouldBeVisible ? "auto" : "none";

    previousVisibilityRef.current = shouldBeVisible;
  }, [shouldBeVisible]);

  return (
    <div
      ref={elementRef}
      className={cn("transition-opacity progress-indicator", className)}
      style={{ opacity: shouldBeVisible ? 1 : 0, pointerEvents: shouldBeVisible ? "auto" : "none" }}
    >
      {children}
    </div>
  );
};
