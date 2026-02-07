export function resolveCharacterCardCaption(
  role: string | null | undefined,
  summary: string | null | undefined,
): string {
  const normalizedRole = role?.trim();
  if (normalizedRole) {
    return normalizedRole;
  }

  const normalizedSummary = summary?.trim();
  return normalizedSummary || "";
}
