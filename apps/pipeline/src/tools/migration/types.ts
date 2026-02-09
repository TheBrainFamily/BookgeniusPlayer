/**
 * Types for paragraph index migration
 */

export interface CueSnapshot {
  _id: string;
  chapter: number;
  paragraph: number;
  fileBasename: string;
  type: "background" | "music";
  // Background-specific
  backgroundColor?: string;
  textColor?: string;
  // Music-specific
  order?: number;
}

export interface ParagraphInfo {
  dataIndex: number;
  text: string;
  elementType: string;
  contentHash: string; // First 100 chars for matching
}

export interface IndexMapping {
  oldIndex: number;
  newIndex: number;
  confidence: "exact" | "fuzzy" | "manual" | "unmapped";
  oldContent: string;
  newContent: string;
  similarity: number; // 0-1
}

export interface ChapterMigration {
  chapter: number;
  oldParagraphs: ParagraphInfo[];
  newParagraphs: ParagraphInfo[];
  mappings: IndexMapping[];
  affectedCues: CueSnapshot[];
}

export interface BookMigrationPlan {
  bookPath: string;
  bookSlug: string;
  timestamp: number;
  chapters: ChapterMigration[];
  totalCues: number;
  snapshotPath: string; // Path to backup JSON
}

export interface MigrationSummary {
  bookSlug: string;
  totalCues: number;
  exactMappings: number;
  fuzzyMappings: number;
  manualReview: number;
  unmapped: number;
}
