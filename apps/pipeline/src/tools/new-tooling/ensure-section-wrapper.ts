export function ensureSectionWrapper(html: string): string {
  const match = html.match(
    /^\s*<section\b[^>]*data-chapter\s*=\s*['"]?\d+['"]?[^>]*>[\s\S]*<\/section>\s*$/i,
  );
  if (!match) {
    throw new Error("Missing <section data-chapter> wrapper");
  }
  return html;
}
