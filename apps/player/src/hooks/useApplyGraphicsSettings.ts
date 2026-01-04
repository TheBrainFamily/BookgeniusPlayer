import { useEffect } from "react";
import { useGraphicsSettings } from "@player/stores/graphicsSettings.store";

export function useApplyGraphicsSettings() {
  const { qualityLevel, backgroundBlur, animationSpeed } = useGraphicsSettings();

  useEffect(() => {
    const legacy = document.getElementById("legacy");
    if (!legacy) return;

    legacy.classList.remove("graphics-full", "graphics-reduced", "graphics-minimal", "graphics-bright");
    legacy.classList.add(`graphics-${qualityLevel}`);
  }, [qualityLevel]);

  useEffect(() => {
    const legacy = document.getElementById("legacy");
    if (!legacy) return;

    if (backgroundBlur > 0) {
      legacy.setAttribute("data-bg-blur", "true");
      legacy.style.setProperty("--bg-blur-amount", `${backgroundBlur}px`);
    } else {
      legacy.removeAttribute("data-bg-blur");
      legacy.style.removeProperty("--bg-blur-amount");
    }
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
