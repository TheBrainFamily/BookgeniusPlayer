import { generateTagName } from "../helpers/generateTagName";
import { type CharacterRoleCleanupResponse } from "../tools/new-tooling/generate-roles-and-remove-spoilers-from-summaries";

export type CleanedCharacterSummary = { referenceCard: string; role?: string };

function toCharacterSlug(name: string): string {
  return generateTagName(name).toLowerCase();
}

export function buildCleanedCharacterSummaryMap(
  cleaned: CharacterRoleCleanupResponse,
): Map<string, CleanedCharacterSummary> {
  const map = new Map<string, CleanedCharacterSummary>();

  for (const character of cleaned.characters) {
    const slug = toCharacterSlug(character.name);
    if (!slug || map.has(slug)) {
      continue;
    }
    map.set(slug, {
      referenceCard: character.referenceCard,
      role: character.role?.trim() || undefined,
    });
  }

  return map;
}

export function resolveCharacterMetadataForUpload(
  character: { name: string; referenceCard: string },
  cleanedMap: Map<string, CleanedCharacterSummary>,
): { summary: string; role?: string } {
  const cleaned = cleanedMap.get(toCharacterSlug(character.name));
  if (!cleaned) {
    return { summary: character.referenceCard };
  }

  return { summary: cleaned.referenceCard, role: cleaned.role };
}
