export interface Location {
  chapter: number;
  paragraph: number;
  endChapter: number;
  endParagraph: number;
  currentChapter: number;
  currentParagraph: number;
  earliestVisibleParagraph: number;
  latestVisibleParagraph: number;
  earliestVisibleChapter: number;
  latestVisibleChapter: number;
}

export const DEFAULT_LOCATION: Location = {
  chapter: 1,
  paragraph: 1,
  endChapter: 1,
  endParagraph: 1,
  currentChapter: 1,
  currentParagraph: 1,
  earliestVisibleParagraph: 1,
  latestVisibleParagraph: 1,
  earliestVisibleChapter: 1,
  latestVisibleChapter: 1,
};
