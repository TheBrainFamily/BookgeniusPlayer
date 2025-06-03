import React, { useEffect, useRef } from "react";

import { useOptionalElementVisibility } from "@/stores/elementVisibility.store";
import { cn } from "@/lib/utils";

interface OptionalElementProps {
  children: React.ReactNode;
  className?: string;
}

export const OptionalElement: React.FC<OptionalElementProps> = ({ children, className }) => {
  const shouldBeVisible = useOptionalElementVisibility();
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
      element.style.transition = `opacity 0.3 ease-in-out`;
    } else if (isBecomingHidden) {
      element.style.transition = `opacity 4s ease-in-out`;
    }

    element.style.opacity = shouldBeVisible ? "1" : "0";
    element.style.pointerEvents = shouldBeVisible ? "auto" : "none";

    previousVisibilityRef.current = shouldBeVisible;
  }, [shouldBeVisible]);

  return (
    <div ref={elementRef} className={cn("transition-opacity", className)} style={{ opacity: shouldBeVisible ? 1 : 0, pointerEvents: shouldBeVisible ? "auto" : "none" }}>
      {children}
    </div>
  );
};
