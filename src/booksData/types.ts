type InfoPerChapter = { chapter: number; summary: string; label?: string; paragraphsWhereSpotted: number[]; paragraphsWhereTalking: number[] };

type CharacterData = { characterName: string; bookSlug: string; infoPerChapter: InfoPerChapter[]; imageUrl: string };

type BookMetadata = { title: string };

export type BookData = { slug: string; metadata: BookMetadata; charactersData: CharacterData[]; bookXml: string; chapters: number };
