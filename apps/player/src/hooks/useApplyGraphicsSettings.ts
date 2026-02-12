import { useEffect, useRef } from "react";
import { useBookConvex } from "@player/context/BookConvexContext";
import { useGraphicsSettings } from "@player/stores/graphicsSettings.store";
import { usePlayerDOM } from "@player/context/PlayerDOMContext";
import { getBookMediaType } from "@player/ui/backgroundUtils";

function animateBlur(legacy: HTMLElement, targetBlur: number): number {
  const durationMs = 1000;
  const startTime = performance.now();
  let rafId = 0;

  const step = (now: number) => {
    const progress = Math.min(1, (now - startTime) / durationMs);
    legacy.style.setProperty("--bg-blur-amount", `${targetBlur * progress}px`);
    if (progress < 1) {
      rafId = requestAnimationFrame(step);
    }
  };

  rafId = requestAnimationFrame(step);
  return rafId;
}

export function useApplyGraphicsSettings() {
  const { legacy, bookContainer, contentContainer, bgVideoA, bgVideoB } = usePlayerDOM();
  const { bookData } = useBookConvex();
  const {
    qualityLevel,
    backgroundBlur,
    syncBackgroundBlurForBookSlug,
    animationSpeed,
    contentOpacity,
    videoContentOpacity,
    edgeFade,
    zoomDuration,
  } = useGraphicsSettings();
  const blurAnimatedRef = useRef(false);

  useEffect(() => {
    syncBackgroundBlurForBookSlug(bookData?.slug);
  }, [bookData?.slug, syncBackgroundBlurForBookSlug]);

  useEffect(() => {
    if (!legacy) return;

    legacy.classList.remove(
      "graphics-full",
      "graphics-reduced",
      "graphics-minimal",
      "graphics-bright",
    );
    legacy.classList.add(`graphics-${qualityLevel}`);
  }, [legacy, qualityLevel]);

  useEffect(() => {
    if (!legacy) return;

    if (backgroundBlur <= 0) {
      legacy.removeAttribute("data-bg-blur");
      legacy.style.removeProperty("--bg-blur-amount");
      legacy.style.removeProperty("--bg-blur-base");
      blurAnimatedRef.current = false;
      return;
    }

    legacy.setAttribute("data-bg-blur", "true");
    legacy.style.setProperty("--bg-blur-base", `${backgroundBlur}px`);

    // First time: animate blur in over 1s when book becomes visible
    if (!blurAnimatedRef.current) {
      blurAnimatedRef.current = true;

      const isVisible = bookContainer?.classList.contains("visible") ?? true;
      if (!isVisible && bookContainer) {
        legacy.style.setProperty("--bg-blur-amount", "0px");
        const observer = new MutationObserver(() => {
          if (!bookContainer.classList.contains("visible")) return;
          observer.disconnect();
          animateBlur(legacy, backgroundBlur);
        });
        observer.observe(bookContainer, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
      }

      const rafId = animateBlur(legacy, backgroundBlur);
      return () => cancelAnimationFrame(rafId);
    }

    // Subsequent changes: apply immediately
    legacy.style.setProperty("--bg-blur-amount", `${backgroundBlur}px`);
  }, [legacy, bookContainer, backgroundBlur]);

  useEffect(() => {
    if (!legacy) return;

    legacy.setAttribute("data-animation-speed", String(animationSpeed));

    if (animationSpeed === 0) {
      bgVideoA?.pause();
      bgVideoB?.pause();
    } else {
      const frontVideo = legacy.dataset.front === "a" ? bgVideoA : bgVideoB;
      if (frontVideo && frontVideo.paused && frontVideo.src) {
        frontVideo.play().catch(() => {});
      }
    }
  }, [legacy, bgVideoA, bgVideoB, animationSpeed]);

  useEffect(() => {
    if (!legacy || !contentContainer) return;

    legacy.style.setProperty("--zoom-duration", `${zoomDuration}s`);

    // Map 0-100 slider to 0%-50% edge fade
    const edgeFadePct = `${edgeFade * 0.5}%`;
    contentContainer.style.setProperty("--edge-fade-pct", edgeFadePct);

    const applyOpacity = () => {
      // Skip when pageObserver owns --gradient-opacity during spacer transitions
      if (contentContainer.hasAttribute("data-spacer-active")) return;

      // Use book-level media type (first background) so opacity stays stable across chapters
      const isVideo = getBookMediaType() === "video";
      const opacity = isVideo ? videoContentOpacity / 100 : contentOpacity / 100;
      contentContainer.style.setProperty("--gradient-opacity", opacity.toString());
    };

    applyOpacity();
  }, [legacy, contentContainer, contentOpacity, videoContentOpacity, edgeFade, zoomDuration]);
}
