import { getBackgroundsForBook } from "@player/state/bookDataStore";

const BACKGROUND_MODE_RADIUS = 1;
const NO_BACKGROUND_MODE_RADIUS = 2;

/**
 * Wider windows are used for books without background transitions.
 * This keeps extra chapters mounted when short sections are too small
 * to reliably advance focus-zone based chapter detection.
 */
export const getVirtualizationWindowRadius = (): number => {
  const hasBackgrounds = getBackgroundsForBook().length > 0;
  return hasBackgrounds ? BACKGROUND_MODE_RADIUS : NO_BACKGROUND_MODE_RADIUS;
};

export const getChapterWindowAround = (
  chapterId: number,
  radius = getVirtualizationWindowRadius(),
) => {
  const window: number[] = [];
  for (let chapter = chapterId - radius; chapter <= chapterId + radius; chapter++) {
    window.push(chapter);
  }
  return window;
};
