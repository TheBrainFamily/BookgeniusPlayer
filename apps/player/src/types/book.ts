export type BackgroundForBook = {
  chapter: number;
  file: string;
  paragraph: number;
  backgroundColor?: string;
  textColor?: string;
};

export type BackgroundSongForBook = { chapter: number; files: string[]; paragraph: number };

export type CutSceneForBook = {
  chapter: number;
  file: string;
  paragraph: number;
  delayInMs?: number;
  text?: string;
};

export type WordPosition = [string, number];

export type AudiobookTracksSection = {
  chapter: number;
  paragraph: number;
  file: string;
  smile_id?: string;
  "clip-begin": number;
  "clip-end": number;
  words?: WordPosition[];
};

type InfoPerChapter = {
  chapter: number;
  summary: string;
  label?: string;
  paragraphsWhereSpotted: number[];
  paragraphsWhereTalking: number[];
  paragraphsWhereEnters?: number[];
  paragraphsWhereExits?: number[];
};

export type ChapterParagraphRef = { chapter: number; paragraph: number };

export type CharacterOverride = {
  from: ChapterParagraphRef;
  to?: ChapterParagraphRef;
  summary?: string;
  display?: string;
  avatar?: string;
};

export type CharacterMedia = { avatarUrl?: string; listensUrl?: string; speaksUrl?: string };

export type CharacterData = {
  slug: string;
  characterName: string;
  bookSlug: string;
  infoPerChapter: InfoPerChapter[];
  overrides?: CharacterOverride[];
  media?: CharacterMedia;
};

type BookMetadata = { title: string; author: string; language?: string; bookForm?: string };

export interface Chapter {
  id: string;
  title: string;
}

export type BookData = {
  slug: string;
  metadata: BookMetadata;
  chapters?: Chapter[];
  hasAudiobook: boolean;
  audioPrompt?: string;
};

export type BackgroundSongSection = { chapter: number; paragraph: number; files: string[] };

export type Filter = {
  chapterFrom: number;
  chapterTo: number;
  paragraphTo: number;
  bookSlug: string;
  paragraphFrom?: number;
};

export type Variant = {
  id: string;
  analysis: { originalSentence: string; reasoning: string; score: number };
  simplifications: { reasoning: string; score: number; sentences: string[] }[];
};
