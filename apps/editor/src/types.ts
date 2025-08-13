export interface CharacterDefinition {
  name: string;
  display: string;
  summary: string;
}

export interface ValidationError {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: "error" | "warning";
}

export type FileType = "book" | string; // string for chapter filenames

export type Variant = { id: string; simplifications: { score: number; sentences: string[] }[] };
