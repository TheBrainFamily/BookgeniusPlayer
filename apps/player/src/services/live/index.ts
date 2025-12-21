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

// Data Injection - stubs (we're always in Convex/live mode now)
export const isLiveMode = (): boolean => true;
export const setLiveMode = (_mode: boolean): void => {};
export const injectLiveData = (): void => {};
export const clearLiveData = (): void => {};

// Types
export * from "./types";
