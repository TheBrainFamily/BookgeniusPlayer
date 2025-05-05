// -----------------------------------------------------------------------------
//  background-videos.ts   (copy-paste entire file)
// -----------------------------------------------------------------------------

import { BOOK_SLUGS } from "../consts";

import { CURRENT_BOOK } from "../consts";

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

  // initialise once -----------------------------------------------------------
  if (!debouncedHandler) {
    debouncedHandler = debounce(async (p: { startChapter: number; startParagraph: number; endChapter: number; endParagraph: number }) => {
      // ---------- mapping -----------------------------------------------------
      const toBackground = ({ chapter, file }: { chapter: number; file: string }) => ({
        startChapter: chapter,
        startParagraph: 1,
        file,
        endChapter: chapter,
        endParagraph: 10_000,
      });

      const backgroundsInput = [
        { chapter: 1, file: "background-egyptian-streets-palace-visible-loop.mp4" },
        { chapter: 2, file: "background-wawoz-fade.mp4" },
        { chapter: 3, file: "background-sara-slow-motion-loop.mp4" },
        { chapter: 4, file: "background-army-fade-loop.mp4" },
        { chapter: 5, file: "background-sara-estate-fade.mp4" },
        { chapter: 6, file: "chapter6-slow-fade-sw-q20.mp4" },
        { chapter: 7, file: "chapter7-slow-fade-sw-q20.mp4" },
        { chapter: 8, file: "background-moving-generic-estate-fade.mp4" },
        { chapter: 9, file: "chapter9-slow-fade-sw-q20.mp4" },
        { chapter: 10, file: "chapter10-slow-fade-sw-q20.mp4" },
        { chapter: 11, file: "chapter11-slow-fade-sw-q20.mp4" },
        { chapter: 12, file: "chapter12-slow-fade-sw-q20.mp4" },
        { chapter: 13, file: "background-moving-generic-estate-fade.mp4" },
        { chapter: 14, file: "background-moving-generic-estate-fade.mp4" },
        { chapter: 15, file: "background-moving-generic-estate-slow-motion-loop.mp4" },
        { chapter: 16, file: "background-generic-pingpong-fade.mp4" },
        { chapter: 17, file: "background-egyptian-streets-palace-visible-loop.mp4" },
        { chapter: 18, file: "background-generic-pingpong-fade.mp4" },
        { chapter: 19, file: "background-egyptian-streets-palace-visible-loop.mp4" },
        { chapter: 20, file: "background-egyptian-streets-palace-visible-loop.mp4" },
        { chapter: 21, file: "background-generic-pingpong-fade.mp4" },
        { chapter: 22, file: "background-generic-pingpong-fade.mp4" },
        { chapter: 23, file: "background-moving-generic-estate-fade.mp4" },
        { chapter: 24, file: "background-moving-generic-estate-fade.mp4" },
        { chapter: 25, file: "background-egyptian-streets-palace-visible-loop.mp4" },
        { chapter: 26, file: "chapter26-slow-fade-sw-q20.mp4" },
        { chapter: 27, file: "chapter27-slow-fade-sw-q20.mp4" },
        { chapter: 28, file: "chapter28-slow-fade-sw-q20.mp4" },
        { chapter: 29, file: "chapter29-slow-fade-sw-q20.mp4" },
        { chapter: 30, file: "chapter30-slow-fade-sw-q20.mp4" },
        { chapter: 31, file: "chapter31-slow-fade-sw-q20.mp4" },
        { chapter: 32, file: "chapter32-slow-fade-sw-q20.mp4" },
        { chapter: 33, file: "chapter33-slow-fade-sw-q20.mp4" },
        { chapter: 34, file: "chapter34-slow-fade-sw-q20.mp4" },
        { chapter: 35, file: "chapter35-slow-fade-sw-q20.mp4" },
        { chapter: 36, file: "chapter36-slow-fade-sw-q20.mp4" },
        { chapter: 37, file: "chapter37-slow-fade-sw-q20.mp4" },
        { chapter: 38, file: "chapter38-slow-fade-sw-q20.mp4" },
        { chapter: 39, file: "chapter39-slow-fade-sw-q20.mp4" },
        { chapter: 40, file: "chapter40-slow-fade-sw-q20.mp4" },
        { chapter: 41, file: "chapter41-slow-fade-sw-q20.mp4" },
        { chapter: 42, file: "chapter42-slow-fade-sw-q20.mp4" },
        { chapter: 43, file: "chapter43-slow-fade-sw-q20.mp4" },
        { chapter: 44, file: "chapter44-slow-fade-sw-q20.mp4" },
        { chapter: 45, file: "chapter45-slow-fade-sw-q20.mp4" },
        { chapter: 46, file: "chapter46-slow-fade-sw-q20.mp4" },
        { chapter: 47, file: "chapter47-slow-fade-sw-q20.mp4" },
        { chapter: 48, file: "chapter48-slow-fade-sw-q20.mp4" },
        { chapter: 49, file: "chapter49-slow-fade-sw-q20.mp4" },
      ];
      let backgrounds = backgroundsInput.map(toBackground);

      if (CURRENT_BOOK === BOOK_SLUGS._1984) {
        const backgroundsInput = [
          { chapter: 1, file: "1984-chapter-1.mp4" },
          { chapter: 2, file: "1984-chapter-2.mp4" },
          { chapter: 3, file: "1984-chapter-3.mp4" },
        ];
        backgrounds = backgroundsInput.map(toBackground);
      }

      // ---------- helpers -----------------------------------------------------
      if (!legacy.dataset.front) legacy.dataset.front = "a";
      if (legacy.dataset.currentFile === undefined) legacy.dataset.currentFile = "";

      const getFront = () => (legacy.dataset.front === "a" ? videoA : videoB);
      const getBack = () => (legacy.dataset.front === "a" ? videoB : videoA);

      const fadeMs = parseFloat(getComputedStyle(videoA).transitionDuration) * 1000 || 800;

      // ---------- main fade function -----------------------------------------
      async function crossFadeTo(file: string) {
        const front = getFront();
        const back = getBack();

        if (legacy.dataset.currentFile === file || isTransitioning) return;
        isTransitioning = true;

        const newSrc = `/${CURRENT_BOOK}/${file}`;
        back.classList.add("faded"); // start hidden

        back.src = newSrc;
        back.load(); // begin buffering

        // --- wait until the first real frame is ready ------------------------
        try {
          await back.play(); // warm decoder
          await new Promise<void>((ok) => back.requestVideoFrameCallback(() => ok()));
        } catch (e) {
          console.error("Video play error:", e);
          isTransitioning = false;
          return;
        }

        // --- start GPU-only cross-fade ---------------------------------------
        requestAnimationFrame(() => {
          back.classList.remove("faded"); // fades IN
          front.classList.add("faded"); // fades OUT
        });

        // --- swap references exactly when fade ends --------------------------
        window.setTimeout(() => {
          legacy.dataset.front = legacy.dataset.front === "a" ? "b" : "a";
          legacy.dataset.currentFile = file;
          front.pause(); // stop hidden video
          isTransitioning = false;
        }, 1500); // tiny safety margin
      }

      // ---------- choose background for this chapter -------------------------
      const found = backgrounds.find((bg) => p.startChapter === bg.startChapter);
      console.log("found", found);
      if (found) crossFadeTo(found.file);
      else console.log(`No background for chapter ${p.startChapter}`);
    }, 150);
  }

  // ---- invoke debounced handler --------------------------------------------
  debouncedHandler({ startChapter, startParagraph, endChapter, endParagraph });
};
