import type { CutScene } from "@/genericBookDataGetters/getCutScenesForBook";

export const getCutScenesForBook = (): CutScene[] => {
  return [
    { chapter: 1, paragraph: 6, file: "mirror-crashing.mp4", text: "", delayInMs: 15000 },
    { chapter: 7, paragraph: 21, file: "kocham-slow.mp4", text: "", delayInMs: 5000 },
    { chapter: 7, paragraph: 19, file: "dzieci-spotkanie.mp4", text: "", delayInMs: 10000 },
  ];
};
