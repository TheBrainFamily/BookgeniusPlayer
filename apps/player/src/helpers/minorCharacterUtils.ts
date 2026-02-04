/**
 * Utilities for handling unknown/minor characters that are not in characterMetadata.
 * Unknown characters are identified by speakers that have a data-speaker attribute
 * but don't match any known character slug in the book's character list.
 */

/**
 * Check if a character slug is for an unknown/minor character
 * by checking if it exists in the set of known character slugs.
 */
export function isUnknownCharacter(slug: string, knownSlugs: Set<string>): boolean {
  return !knownSlugs.has(slug);
}

/**
 * Convert a slug to a human-readable display name.
 * "tall-soldier-at-gate" -> "Tall Soldier At Gate"
 */
export function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
