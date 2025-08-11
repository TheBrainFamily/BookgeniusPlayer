import type { Character } from './characterTagging';
import type { ApiCharacter } from '../types/api';

/**
 * Transforms API character data to the format used by the character tagging system
 * @param characters Array of characters from the API response
 * @returns Array of characters formatted for the UI
 */
export const transformApiCharacters = (characters: ApiCharacter[]): Character[] => {
  return characters.map((char) => ({
    name: char.display,
    tag: char.name
  }));
};