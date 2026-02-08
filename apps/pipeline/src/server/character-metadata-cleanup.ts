import { z } from "zod";

export type CleanedCharacterSummary = { referenceCard: string; role?: string };
export const CharacterRoleCleanupResponseSchema = z.object({
  characters: z.array(
    z.object({
      slug: z.string().min(1),
      referenceCard: z.string(),
      role: z.string().nullable().optional(),
    }),
  ),
});
export type CharacterRoleCleanupResponse = z.infer<typeof CharacterRoleCleanupResponseSchema>;

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export function parseCharacterRoleCleanupResponse(raw: unknown): CharacterRoleCleanupResponse {
  return CharacterRoleCleanupResponseSchema.parse(raw);
}

export function buildCleanedCharacterSummaryMap(
  cleaned: CharacterRoleCleanupResponse,
): Map<string, CleanedCharacterSummary> {
  const map = new Map<string, CleanedCharacterSummary>();

  for (const character of cleaned.characters) {
    const slug = normalizeSlug(character.slug);
    if (!slug) {
      throw new Error("Empty slug in cleaned character response");
    }
    if (map.has(slug)) {
      console.warn(`[character-metadata-cleanup] Duplicate cleaned character slug: ${slug}`);
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
  character: { slug: string; referenceCard: string },
  cleanedMap: Map<string, CleanedCharacterSummary>,
): { summary: string; role?: string } {
  const cleaned = cleanedMap.get(normalizeSlug(character.slug));
  if (!cleaned) {
    return { summary: character.referenceCard };
  }

  return { summary: cleaned.referenceCard, role: cleaned.role };
}
