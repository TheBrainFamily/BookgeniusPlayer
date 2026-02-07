export function stripParenthetical(name: string): string {
  const parenIndex = name.indexOf("(");
  if (parenIndex < 0) return name;
  const before = name.slice(0, parenIndex);
  if (before.length > 5) return before.trim();
  return name;
}

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
