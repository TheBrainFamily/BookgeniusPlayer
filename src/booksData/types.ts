type InfoPerChapter = { chapter: number; summary: string; label?: string; paragraphsWhereSpotted: number[]; paragraphsWhereTalking: number[] };

export type CharacterData = { slug: string; characterName: string; bookSlug: string; infoPerChapter: InfoPerChapter[]; imageUrl: string };

type BookMetadata = { title: string };

export interface BookThemeColors {
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  quaternaryColor: string;
}

export type BookData = { metadata: BookMetadata; charactersData: CharacterData[]; bookXml: string; chapters: number; themeColors: BookThemeColors };
