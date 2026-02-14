import * as cheerio from "cheerio";
import { readFileSync } from "fs";
import type { CharacterEntry, IdentityReveal } from "../types";

interface ParsedCharacters {
  /** Characters found via data-speaker and data-c attributes */
  characters: Map<string, { slug: string; name: string }>;
  /** Identity reveals found via data-reveals attributes */
  reveals: IdentityReveal[];
}

/**
 * Parses annotated XHTML to extract all character slugs and names.
 *
 * After the agent edits a chapter, the orchestrator calls this to discover
 * what characters were referenced. Names are derived from the text content
 * of `<span data-c="slug">Name</span>` elements (first occurrence wins).
 */
export function parseCharactersFromXhtml(
  filePath: string,
  chapterNumber: number,
): ParsedCharacters {
  const html = readFileSync(filePath, "utf-8");
  const $ = cheerio.load(html, { xml: true });

  const characters = new Map<string, { slug: string; name: string }>();
  const reveals: IdentityReveal[] = [];

  // Extract from data-c spans (character mentions — these give us names)
  $("[data-c]").each((_, el) => {
    const slug = $(el).attr("data-c")!;
    if (!characters.has(slug)) {
      const textContent = $(el).text().trim();
      characters.set(slug, { slug, name: textContent || slug });
    }
  });

  // Extract from data-speaker attributes (dialogue attribution)
  $("[data-speaker]").each((_, el) => {
    const slug = $(el).attr("data-speaker")!;
    if (!characters.has(slug)) {
      // For speakers without a data-c mention, use slug as name
      characters.set(slug, { slug, name: slug });
    }

    // Check for identity reveals
    const revealsAttr = $(el).attr("data-reveals");
    if (revealsAttr) {
      reveals.push({ newSlug: slug, previousSlug: revealsAttr, chapterNumber });
    }
  });

  return { characters, reveals };
}

/**
 * Converts parsed characters to CharacterEntry objects for the registry.
 */
export function toCharacterEntries(
  parsed: ParsedCharacters,
  chapterNumber: number,
): CharacterEntry[] {
  return Array.from(parsed.characters.values()).map(({ slug, name }) => ({
    slug,
    name,
    aliases: [],
    description: "",
    firstSeenChapter: chapterNumber,
  }));
}
