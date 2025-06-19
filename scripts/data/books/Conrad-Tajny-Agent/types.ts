// Type definitions for Conrad-Tajny-Agent book

export interface ChapterMetadata {
  id: string;
  title: string;
}

export interface CharacterInfo {
  display: string;
  summary?: string;
}

export interface BookMetadata {
  chapters: ChapterMetadata[];
  characters: Map<string, CharacterInfo>;
  totalChapters: number;
}
