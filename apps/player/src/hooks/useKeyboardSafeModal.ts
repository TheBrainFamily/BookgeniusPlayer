import { useEffect, useRef } from "react";

const KEYBOARD_MARGIN_PX = 12;

export function useKeyboardSafeModal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    let rafId = 0;
    let initialTransformCaptured = false;
    let initialTransform: string | null = null;

    const restoreInitialTransform = () => {
      const element = ref.current;
      if (!element || initialTransform === null) return;
      element.style.transform = initialTransform;
    };

    const updatePosition = () => {
      rafId = 0;
      const element = ref.current;
      if (!element) {
        rafId = window.requestAnimationFrame(updatePosition);
        return;
      }

      if (!initialTransformCaptured) {
        initialTransform = element.style.transform || "";
        initialTransformCaptured = true;
      }

      element.style.transform = initialTransform ?? "";

      const rect = element.getBoundingClientRect();
      const viewportTop = visualViewport.offsetTop;
      const viewportBottom = visualViewport.offsetTop + visualViewport.height;

      const overlapBottom = rect.bottom - viewportBottom;
      const overlapTop = viewportTop - rect.top;

      let translateY = 0;
      if (overlapBottom > 0) {
        translateY -= overlapBottom + KEYBOARD_MARGIN_PX;
      }
      if (overlapTop > 0) {
        translateY += overlapTop + KEYBOARD_MARGIN_PX;
      }

      if (translateY !== 0) {
        const computed = window.getComputedStyle(element);
        const baseTransform = (initialTransform ?? "") || (computed.transform && computed.transform !== "none" ? computed.transform : "");
        element.style.transform = baseTransform ? `${baseTransform} translate3d(0, ${translateY}px, 0)` : `translate3d(0, ${translateY}px, 0)`;
      }
    };

    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updatePosition);
    };

    const handleResize = () => scheduleUpdate();
    const handleScroll = () => scheduleUpdate();
    const handleOrientation = () => scheduleUpdate();
    const handleFocusIn = () => scheduleUpdate();
    const handleFocusOut = () => scheduleUpdate();

    visualViewport.addEventListener("resize", handleResize);
    visualViewport.addEventListener("scroll", handleScroll);
    window.addEventListener("orientationchange", handleOrientation);
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    scheduleUpdate();

    return () => {
      visualViewport.removeEventListener("resize", handleResize);
      visualViewport.removeEventListener("scroll", handleScroll);
      window.removeEventListener("orientationchange", handleOrientation);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      restoreInitialTransform();
    };
  }, []);

  return ref;
}
