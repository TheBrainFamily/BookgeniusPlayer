export type BackgroundForBook = { chapter: number; file: string; paragraph: number };

export type BackgroundSongForBook = { chapter: number; files: string[]; paragraph: number };

export type CutSceneForBook = { chapter: number; file: string; paragraph: number; delayInMs?: number; text?: string };

export type WordPosition = [string, number];

export type AudiobookTracksSection = { chapter: number; paragraph: number; file: string; smile_id?: string; "clip-begin": number; "clip-end": number; words?: WordPosition[] };

type InfoPerChapter = {
  chapter: number;
  summary: string;
  label?: string;
  paragraphsWhereSpotted: number[];
  paragraphsWhereTalking: number[];
  paragraphsWhereEnters?: number[];
  paragraphsWhereExits?: number[];
};

export type CharacterData = { slug: string; characterName: string; bookSlug: string; infoPerChapter: InfoPerChapter[]; imageUrl: string; listeningUrl: string; talkingUrl: string };

type BookMetadata = { title: string; author: string; language?: string; bookForm?: string };

export interface Chapter {
  id: string;
  title: string;
}

export interface BookThemeColors {
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  quaternaryColor: string;
  simplifiedIconColor?: string;
}

export type BookData = { slug: string; metadata: BookMetadata; chapters?: Chapter[]; themeColors: BookThemeColors; hasAudiobook: boolean; audioPrompt?: string };

export type BackgroundSongSection = { chapter: number; paragraph: number; files: string[] };

export type QuizOutput = { id: string; score: number; questions: { id: string; question: string; answers: { id: string; text: string; isCorrect: boolean }[] }[] };

export type Filter = { chapterFrom: number; chapterTo: number; paragraphTo: number; bookSlug: string; paragraphFrom?: number };

export type Variant = {
  id: string;
  analysis: { originalSentence: string; reasoning: string; score: number };
  simplifications: { reasoning: string; score: number; sentences: string[] }[];
};
