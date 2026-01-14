import type { ChapterParagraphRef } from "./book";

/** @deprecated Use ChapterParagraphRef instead */
export type BookContextLocation = ChapterParagraphRef;

export interface BookContextChunk {
  chapter: number;
  paragraph: number;
  text: string;
}

export interface BookContextState {
  lastSentLocation: BookContextLocation | null;
  sentChunks: BookContextChunk[];
}

export interface ExtractedBookText {
  chunks: BookContextChunk[];
  totalChunks: number;
}
