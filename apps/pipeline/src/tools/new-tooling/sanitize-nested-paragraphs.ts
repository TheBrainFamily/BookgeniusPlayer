export function sanitizeNestedParagraphs(html: string): string {
  let depth = 0;
  let out = "";
  let i = 0;

  while (i < html.length) {
    const char = html[i];
    if (char !== "<") {
      out += char;
      i += 1;
      continue;
    }

    const closeIdx = html.indexOf(">", i);
    if (closeIdx === -1) {
      out += html.slice(i);
      break;
    }

    const tag = html.slice(i, closeIdx + 1);
    const lower = tag.toLowerCase();

    if (lower.startsWith("<p") && !lower.startsWith("</p")) {
      if (depth >= 1) {
        // Nested <p> -> drop tag, keep content inline
      } else {
        out += tag;
      }
      depth += 1;
      i = closeIdx + 1;
      continue;
    }

    if (lower.startsWith("</p")) {
      if (depth > 1) {
        // Closing nested <p> -> drop tag
      } else {
        out += tag;
      }
      depth = Math.max(0, depth - 1);
      i = closeIdx + 1;
      continue;
    }

    out += tag;
    i = closeIdx + 1;
  }

  return out;
}
