export interface CharacterEntry {
  slug: string; // "hercule-poirot"
  name: string; // "Hercule Poirot"
  aliases: string[]; // ["Poirot", "the little Belgian"]
  description: string; // "Belgian detective with distinctive mustache"
  firstSeenChapter: number;
}

export interface ChapterInfo {
  chapterNumber: number;
  filePath: string; // working copy path (agent edits this)
  originalFilePath: string; // pristine copy for verification
}

export interface IdentityReveal {
  newSlug: string; // "inspector-japp"
  previousSlug: string; // "mysterious-stranger"
  chapterNumber: number;
}

export interface ProcessingResult {
  chapterNumber: number;
  newCharacters: CharacterEntry[];
  reveals: IdentityReveal[];
  textVerified: boolean;
}

// --- Structured annotation types (fast mode) ---

export type AnnotationType = "speaker" | "mention";

export interface Annotation {
  /** The exact text to search for in the source HTML (enough context for unique match) */
  searchText: string;
  /** The substring within searchText to wrap with a span */
  wrapText: string;
  /** "speaker" for data-speaker, "mention" for data-c */
  type: AnnotationType;
  /** Character slug */
  slug: string;
  /** If this is an identity reveal, the previous slug */
  reveals?: string;
}

export interface ContainerAnnotation {
  /** Exact text from the container's first line/content for identification */
  searchText: string;
  /** The HTML tag to target (blockquote, section, article) */
  tag: string;
  /** Character slug to set as data-speaker on the container */
  slug: string;
}

export interface ChapterAnnotations {
  annotations: Annotation[];
  containerAnnotations: ContainerAnnotation[];
  /** New characters discovered in this chapter */
  newCharacters: Array<{ slug: string; name: string; description: string }>;
}
