// -----------------------------------------------------------------------------
//  background-videos.ts   (copy-paste entire file)
// -----------------------------------------------------------------------------

import { CURRENT_BOOK } from "@/consts";
import { getBackgrounds } from "./getBackgrounds";
export type Background = { startChapter: number; startParagraph: number; file: string; endChapter: number; endParagraph: number };

// ---- generic debounce -------------------------------------------------------
function debounce<T extends (...args: unknown[]) => void>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let t: number | null = null;
  return (...args: Parameters<T>) => {
    if (t !== null) clearTimeout(t);
    t = window.setTimeout(() => {
      t = null;
      fn(...args);
    }, wait);
  };
}

// ---- globals ----------------------------------------------------------------
let debouncedHandler: ((p: { startChapter: number; startParagraph: number; endChapter: number; endParagraph: number }) => void) | null = null;

let isTransitioning = false;

// ---- public API -------------------------------------------------------------
export const dealWithBackground = ({
  startChapter,
  startParagraph,
  endChapter,
  endParagraph,
}: {
  startChapter: number;
  startParagraph: number;
  endChapter: number;
  endParagraph: number;
}) => {
  const legacy = document.getElementById("legacy")!;
  const videoA = document.getElementById("bg-video-a") as HTMLVideoElement;
  const videoB = document.getElementById("bg-video-b") as HTMLVideoElement;
  if (!legacy || !videoA || !videoB) {
    console.error("Background video elements not found");
    return;
  }

  // Define Z-index constants for managing video layers
  // These will be captured by the debouncedHandler closure
  const Z_INDEX_FRONT = "-1"; // Video on top
  const Z_INDEX_BACK = "-2"; // Video underneath

  // initialise once -----------------------------------------------------------
  if (!debouncedHandler) {
    // Perform one-time setup for video elements and legacy dataset attributes
    if (videoA && videoB) {
      let initialFrontVideo = videoA;
      let initialBackVideo = videoB;

      // Respect legacy.dataset.front if already set (e.g., by HTML), otherwise default to 'a'.
      if (legacy.dataset.front === "b") {
        initialFrontVideo = videoB;
        initialBackVideo = videoA;
      } else if (legacy.dataset.front !== "a") {
        // If undefined or any other value, default to 'a'
        legacy.dataset.front = "a";
      }

      initialFrontVideo.style.zIndex = Z_INDEX_FRONT;
      initialFrontVideo.classList.remove("faded"); // Ensure front is visible

      initialBackVideo.style.zIndex = Z_INDEX_BACK;
      initialBackVideo.classList.add("faded"); // Ensure back is hidden
    }

    if (legacy.dataset.currentFile === undefined) {
      legacy.dataset.currentFile = ""; // Initialize if not present
    }

    debouncedHandler = debounce(async (p: { startChapter: number; startParagraph: number; endChapter: number; endParagraph: number }) => {
      const backgrounds = getBackgrounds() as Background[];

      // Ensure dataset attributes are initialized (should be by the one-time setup)
      if (!legacy.dataset.front) legacy.dataset.front = "a";
      if (legacy.dataset.currentFile === undefined) legacy.dataset.currentFile = "";

      const getFront = () => (legacy.dataset.front === "a" ? videoA : videoB);
      const getBack = () => (legacy.dataset.front === "a" ? videoB : videoA);

      const fadeMs = parseFloat(getComputedStyle(videoA).transitionDuration) * 1000 || 800;
      const videoTransitionStyle = `opacity ${getComputedStyle(videoA).transitionDuration} ${getComputedStyle(videoA).transitionTimingFunction}`;

      async function crossFadeTo(file: string) {
        const front = getFront(); // Current visible video
        const back = getBack(); // Video to load new content into

        if (legacy.dataset.currentFile === file || isTransitioning) {
          return;
        }
        isTransitioning = true;

        const newSrc = `/${CURRENT_BOOK}/${file}`;

        back.src = newSrc;
        back.load();

        // --- Make 'back' video instantly opaque and position it underneath ---
        const originalBackTransition = back.style.transition;
        back.style.transition = "none"; // Disable transition for immediate opacity change

        back.classList.remove("faded"); // Opacity should now be 1 immediately
        back.style.zIndex = Z_INDEX_BACK;

        // Force a reflow to ensure the style changes are applied before restoring transition
        // Reading a property like offsetHeight is a common way to do this.
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        back.offsetHeight;

        back.style.transition = originalBackTransition || videoTransitionStyle; // Restore transition

        front.style.zIndex = Z_INDEX_FRONT;

        try {
          await back.play();
          await new Promise<void>((ok) => {
            back.requestVideoFrameCallback(() => {
              ok();
            });
          });
        } catch {
          isTransitioning = false;
          return;
        }

        requestAnimationFrame(() => {
          front.classList.add("faded");
        });

        const safetyMargin = 100; // ms, tiny safety margin

        window.setTimeout(() => {
          front.pause();

          back.style.zIndex = Z_INDEX_FRONT;

          front.style.zIndex = Z_INDEX_BACK;

          legacy.dataset.front = legacy.dataset.front === "a" ? "b" : "a";
          legacy.dataset.currentFile = file;
          isTransitioning = false;
        }, fadeMs + safetyMargin);
      }

      const found = backgrounds.find((bg) => p.startChapter === bg.startChapter);
      console.log("found", found);
      if (found) crossFadeTo(found.file);
      else console.log(`No background for chapter ${p.startChapter}`);
    }, 150);
  }

  debouncedHandler({ startChapter, startParagraph, endChapter, endParagraph });
};
