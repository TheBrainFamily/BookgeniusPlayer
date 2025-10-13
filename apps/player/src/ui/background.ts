import { getBookAssetUrl } from "@player/utils/assetUrls";
import { getBackgrounds } from "./getBackgrounds";
import debounce from "lodash.debounce";
import { getPreloadedElement } from "@player/preloadBackgrounds";
import { getFileType, loadVideoAsHTMLElement } from "./backgroundUtils";
import { bookDataLoader } from "@player/services/bookDataLoader";

export type Background = { startChapter: number; startParagraph: number; file: string; endChapter: number; endParagraph: number; backgroundColor?: string; textColor?: string };

// ---- globals ----------------------------------------------------------------

type DebouncedLike<F extends (...args: unknown[]) => unknown> = F & { cancel: () => void; flush?: () => void; pending?: () => boolean };

let debouncedHandler: DebouncedLike<(currentLocation: { currentChapter: number; currentParagraph: number }) => void> | null = null;

enum TransitionState {
  Idle = "idle", // nothing in progress
  Preparing = "prep", // loading / first-frame wait
  Fading = "fade", // CSS cross-fade running
}

let transitionState: TransitionState = TransitionState.Idle;

let rafId: number | null = null; // requestAnimationFrame handle
let fadeTimeoutId: number | null = null; // setTimeout handle for fade completion
let colorTimeoutId: number | null = null; // setTimeout handle for color change delay
let bgAbort = new AbortController(); // aborts the current "prepare" phase (logical invalidation)
let sessionToken = 0; // increments to invalidate stale closures

// ---- color helpers ---------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace(/^#/, "");

  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return { r, g, b };
  }

  if (cleaned.length === 6) {
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    return { r, g, b };
  }

  return null;
}

/**
 * Calculates relative luminance (perceived brightness) of a color
 * Returns value between 0 (darkest) and 1 (lightest)
 */
function getColorLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;

  // Convert to sRGB
  const rsRGB = rgb.r / 255;
  const gsRGB = rgb.g / 255;
  const bsRGB = rgb.b / 255;

  // Apply gamma correction
  const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  // Calculate relative luminance
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) * 10;
}

function isDarkColor(hex: string, threshold: number = 0.5): boolean {
  console.log("STOJANISKO", { hex, luminance: getColorLuminance(hex), isDark: getColorLuminance(hex) < threshold });

  return getColorLuminance(hex) < threshold;
}

function applyScopedColors({ backgroundColor, textColor }: { backgroundColor?: string; textColor?: string }) {
  const scope = document.getElementById("player-scope") as HTMLElement | null;
  if (!scope) return;

  if (backgroundColor && backgroundColor.trim().length > 0) {
    const isDark = isDarkColor(backgroundColor.trim());
    if (bookDataLoader.getCurrentBook() === "Midsummer-Nights-Dream") {
      scope.style.setProperty("--bg-content-light", backgroundColor.trim());
      if (textColor && textColor.trim().length > 0) {
        scope.style.setProperty("--text-light", textColor.trim());
      } else {
        scope.style.removeProperty("--text-light");
      }
    } else {
      if (isDark) {
        scope.style.setProperty("--bg-content-light", "#000000");
      } else {
        scope.style.setProperty("--bg-content-light", "#ffffff");
      }
      if (isDark) {
        scope.style.setProperty("--text-light", "#f2e4c9");
      } else {
        scope.style.setProperty("--text-light", "#000000");
      }
    }
    if (isDark) {
      scope.style.setProperty("--bg-dark-gradient-opacity", "0.8");
    } else {
      scope.style.setProperty("--bg-dark-gradient-opacity", "1");
    }
  } else {
    scope.style.removeProperty("--bg-content-light");
  }
}

// ---- helpers ----------------------------------------------------------------
function cancelAllImageZoom(imgA: HTMLDivElement, imgB: HTMLDivElement) {
  imgA.classList.remove("zooming");
  imgB.classList.remove("zooming");
}

// Normalize to absolute URL for robust comparisons (handles relative paths, query params, etc.)
function absUrl(u: string): string {
  return new URL(u, window.location.origin).href;
}

function sameUrl(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  try {
    return absUrl(a) === absUrl(b);
  } catch {
    return a === b;
  }
}

// Extract URL from CSS `background-image: url("...")`
function extractUrlFromBg(styleVal: string): string | null {
  const m = styleVal?.match(/url\(\s*["']?(.*?)["']?\s*\)/i);
  return m?.[1] ?? null;
}

// Parse CSS transitionDuration that may be in "s" or "ms"
function parseTransitionMs(val: string | null): number {
  if (!val) return NaN;
  const trimmed = val.trim();
  if (trimmed.endsWith("ms")) return parseFloat(trimmed);
  if (trimmed.endsWith("s")) return parseFloat(trimmed) * 1000;
  // If unit missing, assume seconds as per CSSOM serialization, but keep defensive
  const num = parseFloat(trimmed);
  return Number.isFinite(num) ? num * 1000 : NaN;
}

// ---- Constants --------------------------------------------------------------
const FADE_DURATION_MS = 800; // fallback
const COLOR_DELAY_MS = 120; // slight delay to let background start appearing first

// ---- Main Function ----------------------------------------------------------
export const dealWithBackground = ({ currentChapter, currentParagraph }: { currentChapter: number; currentParagraph: number }) => {
  const legacy = document.getElementById("legacy")!;
  const videoA = document.getElementById("bg-video-a") as HTMLVideoElement;
  const videoB = document.getElementById("bg-video-b") as HTMLVideoElement;
  const imageA = document.getElementById("bg-image-a") as HTMLDivElement;
  const imageB = document.getElementById("bg-image-b") as HTMLDivElement;

  if (!legacy || !videoA || !videoB || !imageA || !imageB) {
    console.error("Background elements (video or image) not found");
    return;
  }

  // Z-indices captured by closure
  const Z_INDEX_FRONT = "-1";
  const Z_INDEX_BACK = "-2";

  // initialise once -----------------------------------------------------------
  if (!debouncedHandler) {
    /* ---------- one-time bootstrap ---------------------------------------- */
    const initialFrontId = legacy.dataset.front === "b" ? "b" : "a";
    const initialType = legacy.dataset.type === "image" ? "image" : "video";
    legacy.dataset.front = initialFrontId;
    legacy.dataset.type = initialType;
    if (legacy.dataset.currentFile === undefined) legacy.dataset.currentFile = "";

    const elements = { video: { a: videoA, b: videoB }, image: { a: imageA, b: imageB } };

    // Hide everything, then reveal the initial front
    [videoA, videoB, imageA, imageB].forEach((el) => {
      el.classList.add("faded");
      el.style.zIndex = Z_INDEX_BACK;
    });
    const initialFrontEl = elements[initialType][initialFrontId];
    initialFrontEl.style.zIndex = Z_INDEX_FRONT;
    initialFrontEl.classList.remove("faded");
    if (initialType === "image" && legacy.dataset.currentFile && getFileType(legacy.dataset.currentFile) === "image") {
      initialFrontEl.classList.add("zooming");
    }

    /* ---------- timing helpers ------------------------------------------- */
    const tdStr = getComputedStyle(videoA).transitionDuration; // e.g. "0.8s" or "200ms"
    const parsed = parseTransitionMs(tdStr);
    const fadeMs = Number.isFinite(parsed) && parsed > 0 ? parsed : FADE_DURATION_MS;
    const safetyMargin = 100; // ms

    /* ---------- main debounced handler ----------------------------------- */
    debouncedHandler = debounce(
      async (currentLocation: { currentChapter: number; currentParagraph: number }) => {
        // Guards for lifecycle invalidation across teardown/re-entry
        const myToken = sessionToken; // snapshot current session
        const signal = bgAbort.signal; // abort semantics for this run

        const backgrounds = getBackgrounds() as Background[];

        const foundAll = backgrounds.filter((bg) => {
          return (currentLocation.currentChapter == bg.startChapter && currentLocation.currentParagraph >= bg.startParagraph) || currentLocation.currentChapter > bg.startChapter;
        });

        const found = foundAll[foundAll.length - 1];

        // Cancel zooms *before* any early-return (so images don't stay zooming)
        if (!found) {
          cancelAllImageZoom(imageA, imageB);
          return;
        }
        if (found.file === legacy.dataset.currentFile) {
          return;
        }
        if (transitionState !== TransitionState.Idle) {
          cancelAllImageZoom(imageA, imageB);
          return;
        }

        /* ---------- PREPARING phase -------------------------------------- */
        transitionState = TransitionState.Preparing;

        const newFile = found.file;
        const newType = getFileType(newFile); // "video" | "image"
        if (newType === "unknown") {
          console.error("Unknown file type:", newFile);
          transitionState = TransitionState.Idle;
          return;
        }
        const newSrc = getBookAssetUrl(newFile); // expected to resolve to the current book's absolute URL (or equivalent)

        const curType = legacy.dataset.type as "video" | "image";
        const curFrontId = legacy.dataset.front as "a" | "b";
        const nextFrontId = curFrontId === "a" ? "b" : "a";

        const el = { video: { a: videoA, b: videoB }, image: { a: imageA, b: imageB } };
        const curFront = el[curType][curFrontId];
        const curBack = el[curType][nextFrontId];
        const nextBack = el[newType][nextFrontId];

        /* ---------- load / prime incoming layer (SAFE PRELOAD) ----------- */
        nextBack.style.transition = "none";
        nextBack.classList.remove("faded", "zooming");
        nextBack.style.zIndex = Z_INDEX_BACK;

        let prep: Promise<void> = Promise.resolve();

        if (newType === "video") {
          const vid = nextBack as HTMLVideoElement;
          const pre = getPreloadedElement(newFile);

          // Only reuse preloaded video if it points to EXACTLY the same absolute URL and is already buffered.
          const canReusePreload =
            pre instanceof HTMLVideoElement &&
            pre.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
            sameUrl(new URL(pre.src, window.location.href).href, new URL(newSrc, window.location.href).href);

          if (canReusePreload) {
            vid.src = pre.src;
            vid.currentTime = 0;
          } else {
            // Do NOT trust preload; (re)load with the current book's absolute URL
            loadVideoAsHTMLElement(vid, newSrc);
          }

          // Ensure at least one decoded frame before cross-fade
          prep = vid
            .play()
            .then(
              () =>
                new Promise<void>((ok) => {
                  // NOTE: rVFC has no cancel API; rely on token/abort guards below.
                  vid.requestVideoFrameCallback(() => ok());
                }),
            )
            .catch((e) => {
              console.error("Video play/load error:", e);
              throw e;
            });
        } else {
          const img = nextBack as HTMLDivElement;
          const pre = getPreloadedElement(newFile);

          if (pre instanceof HTMLDivElement) {
            const preUrl = extractUrlFromBg(pre.style.backgroundImage);
            if (preUrl && sameUrl(preUrl, newSrc)) {
              // Safe to reuse the already resolved background-image
              img.style.backgroundImage = pre.style.backgroundImage;
            } else {
              // Fallback to the correct URL for the current book
              img.style.backgroundImage = `url('${newSrc}')`;
            }
          } else {
            // No preload or wrong type -> set the proper URL
            img.style.backgroundImage = `url('${newSrc}')`;
          }

          img.classList.add("zooming");
        }

        // Force reflow to apply "transition: none" reset cleanly, then restore transition
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        nextBack.offsetHeight;
        nextBack.style.transition = "";

        try {
          await prep; // <-- asset ready

          // If teardown/reset happened while preparing, exit silently
          if (signal.aborted || myToken !== sessionToken) {
            transitionState = TransitionState.Idle;
            return;
          }

          transitionState = TransitionState.Fading;

          /* ---------- kick off the cross-fade --------------------------- */
          nextBack.classList.remove("faded"); // now visible (back layer)

          rafId = requestAnimationFrame(() => {
            // Guard inside RAF
            if (signal.aborted || myToken !== sessionToken) return;
            curFront.classList.add("faded");
          });

          // Slightly delay color variable update to align with fade
          if (colorTimeoutId !== null) {
            clearTimeout(colorTimeoutId);
            colorTimeoutId = null;
          }
          colorTimeoutId = window.setTimeout(() => {
            if (signal.aborted || myToken !== sessionToken) return;
            applyScopedColors({ backgroundColor: found.backgroundColor, textColor: found.textColor });
          }, COLOR_DELAY_MS);

          fadeTimeoutId = window.setTimeout(() => {
            // Guard inside timeout
            if (signal.aborted || myToken !== sessionToken) return;

            if (curType === "video") (curFront as HTMLVideoElement).pause();

            nextBack.style.zIndex = Z_INDEX_FRONT;
            curFront.style.zIndex = Z_INDEX_BACK;

            if (curType !== newType) {
              curBack.classList.add("faded");
              curBack.style.zIndex = Z_INDEX_BACK;
              if (curType === "video") (curBack as HTMLVideoElement).pause();
            }

            legacy.dataset.front = nextFrontId;
            legacy.dataset.type = newType;
            legacy.dataset.currentFile = newFile;
            if (curType === "image") curFront.classList.remove("zooming");

            transitionState = TransitionState.Idle;
            fadeTimeoutId = null; // clear handle after completion
          }, fadeMs + safetyMargin);
        } catch (err) {
          /* ---------- prep failed → roll back --------------------------- */
          console.error("Background preparation failed:", err);

          curFront.classList.remove("faded");
          curFront.style.zIndex = Z_INDEX_FRONT;
          if (curType === "image") curFront.classList.add("zooming");

          nextBack.classList.add("faded");
          nextBack.style.zIndex = Z_INDEX_BACK;

          if (newType === "video") (nextBack as HTMLVideoElement).pause();
          if (newType === "image") (nextBack as HTMLDivElement).style.backgroundImage = "none";

          transitionState = TransitionState.Idle;
        }
      },
      150,
      { leading: true, trailing: true, maxWait: 150 },
    ) as DebouncedLike<(currentLocation: { currentChapter: number; currentParagraph: number }) => void>; // cast to our local DebouncedLike
  }

  /* ---------- invoke the handler ----------------------------------------- */
  debouncedHandler({ currentChapter, currentParagraph });
};

/**
 * Hard-reset the debounced background handler and any pending visual updates.
 * Use this at the very start of teardown to prevent stale closures from
 * mutating DOM/video after the player is being removed or reinitialized.
 */
export function resetBackgroundDebouncer(): void {
  // Cancel debounce queue
  try {
    debouncedHandler?.cancel();
  } catch {
    // ignore
  }
  debouncedHandler = null;

  // Cancel any scheduled visual updates
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (fadeTimeoutId !== null) {
    clearTimeout(fadeTimeoutId);
    fadeTimeoutId = null;
  }
  if (colorTimeoutId !== null) {
    clearTimeout(colorTimeoutId);
    colorTimeoutId = null;
  }

  // Invalidate current async "prepare" phase (logical abort)
  try {
    bgAbort.abort();
  } catch {
    // ignore
  }
  // Create a fresh controller for the next session
  bgAbort = new AbortController();

  // Invalidate all pending closures captured by older calls
  sessionToken++;

  // Return to a clean state
  transitionState = TransitionState.Idle;
}
