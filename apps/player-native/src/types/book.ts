export type BackgroundForBook = {
  chapter: number;
  file: string;
  paragraph: number;
  backgroundColor?: string;
  textColor?: string;
};

export type BackgroundSongSection = { chapter: number; paragraph: number; files: string[] };

type InfoPerChapter = {
  chapter: number;
  summary: string;
  label?: string;
  paragraphsWhereSpotted: number[];
  paragraphsWhereTalking: number[];
  paragraphsWhereEnters?: number[];
  paragraphsWhereExits?: number[];
};

export type CharacterMedia = { avatarUrl?: string; listensUrl?: string; speaksUrl?: string };

export type CharacterData = {
  slug: string;
  characterName: string;
  bookSlug: string;
  infoPerChapter: InfoPerChapter[];
  media?: CharacterMedia;
};

export interface Chapter {
  id: string;
  title: string;
  chapterNumber: number;
}

export type BookMetadata = { title: string; author: string; language?: string; bookForm?: string };

export interface ChapterInfo {
  basename: string;
  versionId: string;
  chapterNumber: number;
  title?: string;
  url?: string;
}

export interface CharacterBundle {
  path: string;
  slug: string;
  name: string;
  metadata: { displayName?: string; summary?: string };
  avatar?: { url: string; versionId: string };
  speaks?: { url: string; versionId: string };
  listens?: { url: string; versionId: string };
}
