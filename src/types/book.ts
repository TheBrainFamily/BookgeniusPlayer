export type BackgroundForBook = { chapter: number; file: string; paragraph: number };

export type BackgroundSongForBook = { chapter: number; files: string[]; paragraph: number };

export type CutSceneForBook = { chapter: number; file: string; paragraph: number; delayInMs?: number; text?: string };
