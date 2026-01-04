import { useEffect, useRef } from "react";
import { useGraphicsSettings } from "@player/stores/graphicsSettings.store";

export function useApplyGraphicsSettings() {
  const { qualityLevel, backgroundBlur, animationSpeed } = useGraphicsSettings();
  const initialBlurAnimationRef = useRef<number | null>(null);
  const hasAnimatedBlurRef = useRef(false);

  useEffect(() => {
    const legacy = document.getElementById("legacy");
    if (!legacy) return;

    legacy.classList.remove("graphics-full", "graphics-reduced", "graphics-minimal", "graphics-bright");
    legacy.classList.add(`graphics-${qualityLevel}`);
  }, [qualityLevel]);

  useEffect(() => {
    const legacy = document.getElementById("legacy");
    if (!legacy) return;

    const bookContainer = document.getElementById("book-container");

    const cancelAnimation = () => {
      if (initialBlurAnimationRef.current !== null) {
        cancelAnimationFrame(initialBlurAnimationRef.current);
        initialBlurAnimationRef.current = null;
      }
    };

    const applyMultiplier = (multiplier: number) => {
      legacy.style.setProperty("--bg-blur-multiplier", multiplier.toString());
      legacy.style.setProperty("--bg-blur-amount", `${backgroundBlur * multiplier}px`);
    };

    const getMultiplierFromStyle = () => {
      const multiplierValue = Number.parseFloat(legacy.style.getPropertyValue("--bg-blur-multiplier"));
      return Number.isFinite(multiplierValue) ? multiplierValue : null;
    };

    const animateToFull = (startMultiplier: number) => {
      cancelAnimation();
      applyMultiplier(startMultiplier);

      const durationMs = 1000;
      const startTime = performance.now();

      const step = (now: number) => {
        const progress = Math.min(1, (now - startTime) / durationMs);
        const blurMultiplier = startMultiplier + (1 - startMultiplier) * progress;

        applyMultiplier(blurMultiplier);

        if (progress < 1) {
          initialBlurAnimationRef.current = requestAnimationFrame(step);
        } else {
          initialBlurAnimationRef.current = null;
        }
      };

      initialBlurAnimationRef.current = requestAnimationFrame(step);
    };

    if (backgroundBlur > 0) {
      legacy.setAttribute("data-bg-blur", "true");
      legacy.style.setProperty("--bg-blur-base", `${backgroundBlur}px`);

      const isVisible = bookContainer?.classList.contains("visible") ?? true;
      const existingMultiplier = getMultiplierFromStyle();
      const currentMultiplier = existingMultiplier ?? (isVisible ? 1 : 0);

      if (!bookContainer) {
        applyMultiplier(currentMultiplier);
        return () => {
          cancelAnimation();
        };
      }

      if (!isVisible) {
        applyMultiplier(0);
      } else if (!hasAnimatedBlurRef.current) {
        hasAnimatedBlurRef.current = true;
        const startMultiplier = existingMultiplier ?? 0;
        animateToFull(startMultiplier);
      } else {
        applyMultiplier(currentMultiplier);
      }

      let observer: MutationObserver | null = null;
      if (!hasAnimatedBlurRef.current) {
        observer = new MutationObserver(() => {
          if (!bookContainer.classList.contains("visible")) return;
          if (hasAnimatedBlurRef.current) return;

          hasAnimatedBlurRef.current = true;
          const startMultiplier = getMultiplierFromStyle() ?? 0;
          animateToFull(startMultiplier);
        });

        observer.observe(bookContainer, { attributes: true, attributeFilter: ["class"] });
      }

      return () => {
        observer?.disconnect();
        cancelAnimation();
      };
    }

    hasAnimatedBlurRef.current = false;
    cancelAnimation();
    legacy.removeAttribute("data-bg-blur");
    legacy.style.removeProperty("--bg-blur-base");
    legacy.style.removeProperty("--bg-blur-multiplier");
    legacy.style.removeProperty("--bg-blur-amount");
  }, [backgroundBlur]);

  useEffect(() => {
    const legacy = document.getElementById("legacy");
    if (!legacy) return;

    legacy.setAttribute("data-animation-speed", String(animationSpeed));

    const videoA = document.getElementById("bg-video-a") as HTMLVideoElement | null;
    const videoB = document.getElementById("bg-video-b") as HTMLVideoElement | null;

    if (animationSpeed === 0) {
      videoA?.pause();
      videoB?.pause();
    } else {
      const frontVideo = legacy.dataset.front === "a" ? videoA : videoB;
      if (frontVideo && frontVideo.paused && frontVideo.src) {
        frontVideo.play().catch(() => {});
      }
    }
  }, [animationSpeed]);
}
