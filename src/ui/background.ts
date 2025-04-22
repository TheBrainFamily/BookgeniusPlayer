// Background video handling functions

export const dealWithBackground = ({ startChapter, startParagraph, endChapter, endParagraph }) => {
  /* ---------- helpers ---------- */
  const toBackground = ({ chapter, file }) => {
    return { startChapter: chapter, startParagraph: 1, file, endChapter: chapter, endParagraph: 10000 };
  };

  const legacyElement = document.getElementById("legacy");
  const videoA = document.getElementById("bg-video-a");
  const videoB = document.getElementById("bg-video-b");

  /* Track which video is currently on top (A starts) */
  if (!legacyElement.dataset.front) {
    legacyElement.dataset.front = "a";
  }
  const getFront = () => (legacyElement.dataset.front === "a" ? videoA : videoB) as HTMLVideoElement;
  const getBack = () => (legacyElement.dataset.front === "a" ? videoB : videoA) as HTMLVideoElement;

  let front = getFront();
  let back = getBack();

  /* duration in ms = value of --transition-duration (default 0.8 s) */
  const fadeMs = parseFloat(getComputedStyle(front).transitionDuration) * 1000 || 800;

  /* -------- cross‑fade core -------- */
  function crossFadeTo(file) {
    if (legacyElement.dataset.currentFile === file) {
      return; /* already showing */
    }

    const newSrc = `/Pharaon/${file}`;

    back.src = newSrc;
    back.load(); /* start buffering */

    back.addEventListener(
      "loadeddata",
      () => {
        back.currentTime = 0;
        back.play();

        /* step 1 — be sure the back video starts at opacity 0 */
        back.classList.add("faded");

        /* step 2 — next frame: fade back in, front out */
        requestAnimationFrame(() => {
          back.classList.remove("faded"); /* fades IN */
          front.classList.add("faded"); /* fades OUT */
        });

        /* step 3 — after the transition, swap roles */
        setTimeout(() => {
          legacyElement.dataset.front = legacyElement.dataset.front === "a" ? "b" : "a";
          legacyElement.dataset.currentFile = file;

          /* refresh references for the next call */
          front = getFront();
          back = getBack();
        }, fadeMs);
      },
      { once: true },
    );
  }

  /* ---------- mapping  ---------- */
  const backgroundsPassedFromGemini = [
    { chapter: 1, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 2, file: "background-wawoz-fade.mp4" },
    { chapter: 3, file: "background-sara-slow-motion-loop.mp4" },
    { chapter: 4, file: "background-army-fade-loop.mp4" },
    { chapter: 5, file: "background-sara-estate-fade.mp4" },
    { chapter: 6, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 7, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 8, file: "background-moving-generic-estate-fade.mp4" },
    { chapter: 9, file: "background-moving-generic-estate-slow-motion-loop.mp4" },
    { chapter: 10, file: "background-moving-generic-faster-estate-fade.mp4" },
    { chapter: 11, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 12, file: "background-generic-pingpong-fade.mp4" },
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
  ];
  const backgrounds = backgroundsPassedFromGemini.map(toBackground);

  /* ---------- decide & apply ---------- */
  console.log("BACKGROUND deciding", { startChapter, startParagraph, endChapter, endParagraph });

  for (const bg of backgrounds) {
    if (startChapter === bg.startChapter && startParagraph <= bg.endParagraph && endChapter === bg.endChapter && endParagraph >= bg.startParagraph) {
      crossFadeTo(bg.file);
      break;
    }
  }

  /* when no match: fade to blurred PNG only */
  // if (!applied) {
  //   videoA.classList.add("faded");
  //   videoB.classList.add("faded");
  //   legacyElement.dataset.currentFile = "";
  // }
};
