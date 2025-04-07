export interface IEntityNote {
  entity: string;
  mentionedAs: string;
  canonicalName: string;
  summary: string;
  longerSummary: string;
  imageUrl?: string;
  fullSentence: string;
  lastSeenPage: number | null;
  lastSeenContext: string | null;
  isFirstAppearance: boolean;
  alternativeSummary: string;
  introSummary: string;
}

export interface IPageMetadata {
  notesForPage: IEntityNote[];
  contextForPage: string;
  chapterSummary: string;
}

export interface IEnhancedPage {
  pageNumber: number;
  pageText: string;
  chapter: number;
  metadata: IPageMetadata;
  bookSlug: BOOK_SLUGS;
}

export enum BOOK_SLUGS {
  GET_SHORTY = "shorty",
  INNOCENCE = "innocence",
  TRUMP = "trump",
  PHARAON = "pharaon",
}
