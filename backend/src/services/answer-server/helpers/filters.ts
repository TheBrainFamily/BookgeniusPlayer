import type { Document } from "../embeddingManager";
export type Filter = {
  paragraphFrom?: number;
  paragraphTo?: number;
  chapterFrom?: number;
  chapterTo: number;
  bookSlug: string;
};

export const shouldAllowDocument = (doc: Document, filter?: Filter) => {
  const chapterFrom = filter?.chapterFrom;
  const chapterTo = filter?.chapterTo;
  const paragraphFrom = filter?.paragraphFrom;
  const paragraphTo = filter?.paragraphTo;
  const docChapter = doc.chapter;
  const docParagraph = doc.paragraphNumber;

  if (chapterFrom !== undefined && docChapter < chapterFrom) {
    return false;
  }

  if (chapterTo !== undefined && docChapter > chapterTo) {
    return false;
  }

  if (
    chapterFrom !== undefined &&
    docChapter === chapterFrom &&
    paragraphFrom !== undefined &&
    docParagraph < paragraphFrom
  ) {
    return false;
  }

  if (chapterTo !== undefined && docChapter === chapterTo && paragraphTo !== undefined && docParagraph > paragraphTo) {
    return false;
  }

  return true;
};
