import { getBookAssetBaseUrl } from "@/utils/assetUrls";
import { getBackgrounds } from "./getBackgrounds";
import debounce from "lodash.debounce";

export type Background = { startChapter: number; startParagraph: number; file: string; endChapter: number; endParagraph: number };

// ---- globals ----------------------------------------------------------------
let debouncedHandler: ((currentLocation: { currentChapter: number; currentParagraph: number }) => void) | null = null;

enum TransitionState {
  Idle = "idle", // nothing in progress
  Preparing = "prep", // loading / first-frame wait
  Fading = "fade", // CSS cross-fade running
}

let transitionState: TransitionState = TransitionState.Idle;

// ---- helper -----------------------------------------------------------------
function cancelAllImageZoom(imgA: HTMLDivElement, imgB: HTMLDivElement) {
  imgA.classList.remove("zooming");
  imgB.classList.remove("zooming");
}

// ---- Helper Function --------------------------------------------------------
function getFileType(filename: string): "video" | "image" | "unknown" {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return "unknown";
  if (["mp4", "webm", "ogv"].includes(ext)) return "video";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(ext)) return "image";
  return "unknown";
}

// ---- Constants --------------------------------------------------------------
const FADE_DURATION_MS = 800; // fallback

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

    // hide everything, then reveal the initial front
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
    const transDur = parseFloat(getComputedStyle(videoA).transitionDuration) || FADE_DURATION_MS / 1000;
    const fadeMs = transDur * 1000;
    const safetyMargin = 100; // ms

    /* ---------- main debounced handler ----------------------------------- */
    debouncedHandler = debounce(
      async (currentLocation: { currentChapter: number; currentParagraph: number }) => {
        const backgrounds = getBackgrounds() as Background[];

        const foundAll = backgrounds.filter((bg) => {
          return (currentLocation.currentChapter == bg.startChapter && currentLocation.currentParagraph >= bg.startParagraph) || currentLocation.currentChapter > bg.startChapter;
        });

        const found = foundAll[foundAll.length - 1];

        /* ---- cancel zooms *before* any early-return --------------------- */

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
        const newSrc = `${getBookAssetBaseUrl()}/${newFile}`;

        const curType = legacy.dataset.type as "video" | "image";
        const curFrontId = legacy.dataset.front as "a" | "b";
        const nextFrontId = curFrontId === "a" ? "b" : "a";

        const el = { video: { a: videoA, b: videoB }, image: { a: imageA, b: imageB } };
        const curFront = el[curType][curFrontId];
        const curBack = el[curType][nextFrontId];
        const nextBack = el[newType][nextFrontId];

        /* ---------- load / prime incoming layer -------------------------- */
        nextBack.style.transition = "none";
        nextBack.classList.remove("faded", "zooming");
        nextBack.style.zIndex = Z_INDEX_BACK;

        let prep: Promise<void> = Promise.resolve();
        if (newType === "video") {
          const vid = nextBack as HTMLVideoElement;
          vid.src = newSrc;
          vid.load();
          prep = vid
            .play()
            .then(() => new Promise<void>((ok) => vid.requestVideoFrameCallback(() => ok())))
            .catch((e) => {
              console.error("Video play/load error:", e);
              throw e;
            });
        } else {
          const img = nextBack as HTMLDivElement;
          img.style.backgroundImage = `url('${newSrc}')`;
          img.classList.add("zooming");
        }

        /* eslint-disable @typescript-eslint/no-unused-expressions */
        nextBack.offsetHeight; // reflow
        nextBack.style.transition = ""; // restore CSS
        /* eslint-enable  @typescript-eslint/no-unused-expressions */

        try {
          await prep; // <-- asset ready
          transitionState = TransitionState.Fading;

          /* ---------- kick off the cross-fade --------------------------- */
          nextBack.classList.remove("faded"); // now visible (back layer)

          requestAnimationFrame(() => {
            curFront.classList.add("faded");
          });

          window.setTimeout(() => {
            /* ------ fade complete -------------------------------------- */
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
    ); // debounce
  }

  /* ---------- invoke the handler ----------------------------------------- */
  debouncedHandler({ currentChapter, currentParagraph });
};
