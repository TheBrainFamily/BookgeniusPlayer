import type { CharacterData } from "@player/types/book";
const AVATAR_COLORS = ["#2563eb", "#db2777", "#059669", "#7c3aed", "#ea580c", "#0891b2", "#4f46e5", "#be185d", "#16a34a", "#ca8a04"];

// Consistent color based on unique slug
export function getColorFromSlug(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

// Extract up to 2 initials
export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return parts[0][0]?.toUpperCase() || "?";
}

/**
 * Returns the best available avatar source.
 * Falls back to a programmatically generated SVG if no URL exists.
 */
export function getAvatarSource(character: CharacterData) {
  const url = character.media?.avatarUrl;

  if (url) return url;

  // Fallback Logic
  const initials = getInitials(character.characterName);
  const bgColor = getColorFromSlug(character.slug);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="${bgColor}"/>
      <text 
        x="50%" y="50%" 
        dominant-baseline="central" text-anchor="middle" 
        fill="white" font-family="sans-serif" font-size="45" font-weight="bold"
      >
        ${initials}
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
