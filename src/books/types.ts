export interface ChapterMetadata {
  id: string;
  title: string;
}

export type InfoPerChapter = { chapter: number; summary: string; label?: string; paragraphsWhereSpotted: number[]; paragraphsWhereTalking: number[] };

export type CharacterData = { slug: string; characterName: string; bookSlug: string; infoPerChapter: InfoPerChapter[]; imageUrl: string };

export interface CharacterInfo {
  display: string;
  summary?: string;
}

export interface BookMetadata {
  title: string;
}

export interface BookThemeColors {
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  quaternaryColor: string;
}

export type BookData = { slug: string; metadata: BookMetadata; chapters: number; hasAudiobook: boolean; bookStringified: string; themeColors: BookThemeColors };
