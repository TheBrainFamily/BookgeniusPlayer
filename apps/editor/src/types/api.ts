// API response types
export interface ApiCharacter {
  name: string;
  display: string;
  summary: string;
}

export interface BookData {
  metadata: Record<string, string>;
  chapters: Record<string, string>;
  characters: ApiCharacter[];
}