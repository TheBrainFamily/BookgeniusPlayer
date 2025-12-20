/**
 * Live mode services for reactive content loading from Convex CMS.
 *
 * This module provides browser-compatible XML processing and content
 * transformation for the BookGenius player's live preview mode.
 */

// XML Processing
export { xmlToComplexHtml, wrapPunctuationAdvanced } from "./xmlProcessor";

// Character Extraction
export {
  getCharacterTags,
  getCharacterOverrides,
  extractCharacterMetadata,
  type SimpleCharacterMetadata,
  type ChapterInfo,
  type CharacterOverrideMetadata,
} from "./characterExtractor";

// Data Injection
export { injectLiveData, clearLiveData, isLiveMode, setLiveMode } from "./liveDataInjector";

// Types
export * from "./types";
