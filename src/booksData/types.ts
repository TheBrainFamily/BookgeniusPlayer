type CharacterData = { name?: string; description?: string; [key: string]: string | number | boolean | undefined | null | object };

type BookMetadata = {
  title: string;
  // author?: string;
  // year?: number;
  // description?: string;
};

export type BookData = { slug: string; metadata: BookMetadata; charactersData: CharacterData[]; bookXml: string; chapters: number };
