export interface BookContextLocation {
  chapter: number;
  paragraph: number;
}

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
