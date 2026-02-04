export type SectionWrapper = { tagName: string; attributes: Record<string, string> };

export type SectionExtract = { inner: string; wrapper: SectionWrapper | null };

function isNameChar(char: string): boolean {
  return /[A-Za-z0-9_:-]/.test(char);
}

export function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let i = 0;

  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) break;

    let name = "";
    while (i < raw.length && isNameChar(raw[i])) {
      name += raw[i];
      i += 1;
    }

    if (!name) break;

    while (i < raw.length && /\s/.test(raw[i])) i++;
    let value = "";

    if (raw[i] === "=") {
      i += 1;
      while (i < raw.length && /\s/.test(raw[i])) i++;

      const quote = raw[i];
      if (quote === '"' || quote === "'") {
        i += 1;
        const start = i;
        while (i < raw.length && raw[i] !== quote) i++;
        value = raw.slice(start, i);
        if (raw[i] === quote) i += 1;
      } else {
        const start = i;
        while (i < raw.length && !/\s|>/.test(raw[i])) i++;
        value = raw.slice(start, i);
      }
    }

    attrs[name] = value;
  }

  return attrs;
}

function buildAttributeString(attributes: Record<string, string>): string {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return "";
  return (
    " " + entries.map(([key, value]) => `${key}="${value.replace(/\\"/g, "&quot;")}"`).join(" ")
  );
}

export function extractSectionInner(html: string): SectionExtract {
  const match = html.match(/^\s*<section\b([^>]*)>([\s\S]*)<\/section>\s*$/i);
  if (!match) {
    return { inner: html, wrapper: null };
  }

  const attributes = parseAttributes(match[1] ?? "");
  return { inner: match[2] ?? "", wrapper: { tagName: "section", attributes } };
}

export function buildSectionWrapper(inner: string, wrapper: SectionWrapper | null): string {
  if (!wrapper) return inner;
  return `<${wrapper.tagName}${buildAttributeString(wrapper.attributes)}>${inner}</${wrapper.tagName}>`;
}
