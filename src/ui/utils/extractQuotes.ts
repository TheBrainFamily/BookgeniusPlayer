/* ------------------------------------------------------------------ *
 *  extractQuotes – bullet-proof edition                              *
 * ------------------------------------------------------------------ */
export function extractQuotes(raw: string): string[] {
  const quotes: string[] = [];
  let m: RegExpExecArray | null;

  /* 1️⃣  “real” quotes */
  const quoteRe = /["“”„«»]([\s\S]{20,}?)["“”„«»]/g;
  while ((m = quoteRe.exec(raw)) !== null) {
    quotes.push(m[1]);
  }

  /* 2️⃣  long **bold** spans that are used as quotes */
  const boldRe = /\*\*([\s\S]{20,}?)\*\*/g;
  while ((m = boldRe.exec(raw)) !== null) {
    quotes.push(m[1]);
  }

  /* 3️⃣  sanitise + de-dup */
  const seen = new Set<string>();
  const cleanQuotes: string[] = [];

  quotes.forEach((q) => {
    const clean = q
      /* remove Markdown bold, stray quotes */
      .replace(/\*\*/g, "")
      /* crush internal line-breaks introduced by bullet wraps */
      .replace(/\n\s*\*\s+/g, " ")
      /* leading list markers (*, -, +) */
      .replace(/^[\s>*+-]+\s*/, "")
      .trim();

    if (clean && !seen.has(clean)) {
      seen.add(clean);
      cleanQuotes.push(clean);
    }
  });

  return cleanQuotes;
}
