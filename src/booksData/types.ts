import { BOOK_SLUGS } from "@/consts";

type InfoPerChapter = { chapter: number; summary: string; label?: string; paragraphsWhereSpotted: number[]; paragraphsWhereTalking: number[] };

export type CharacterData = { slug: string; characterName: string; bookSlug: string; infoPerChapter: InfoPerChapter[]; imageUrl: string };

type BookMetadata = { title: string };

export interface BookThemeColors {
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  quaternaryColor: string;
}

export type BookData = { slug: BOOK_SLUGS; metadata: BookMetadata; charactersData: CharacterData[]; chapters: number; themeColors: BookThemeColors; hasAudiobook: boolean };
