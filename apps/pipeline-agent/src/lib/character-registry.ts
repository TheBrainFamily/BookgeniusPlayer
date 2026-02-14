import { generateTagName } from "@pipeline/helpers/generateTagName";
import type { CharacterEntry, IdentityReveal } from "../types";

/**
 * Ephemeral in-memory character registry.
 *
 * Tracks characters discovered during processing so the orchestrator can
 * pass accumulated context to subsequent chapter prompts. Not persisted —
 * the XHTML files are the single source of truth.
 */
export class CharacterRegistry {
  private characters = new Map<string, CharacterEntry>();
  private aliasIndex = new Map<string, string>(); // alias → slug
  private reveals: IdentityReveal[] = [];

  register(name: string, chapter: number, description = ""): CharacterEntry {
    const slug = generateTagName(name);

    if (this.characters.has(slug)) {
      return this.characters.get(slug)!;
    }

    const entry: CharacterEntry = {
      slug,
      name,
      aliases: [],
      description,
      firstSeenChapter: chapter,
    };

    this.characters.set(slug, entry);
    this.aliasIndex.set(name.toLowerCase(), slug);
    return entry;
  }

  /** Register a character with a pre-determined slug (from XHTML parsing). */
  registerWithSlug(slug: string, name: string, chapter: number): CharacterEntry {
    if (this.characters.has(slug)) {
      const existing = this.characters.get(slug)!;
      // Update name if the new one is more descriptive (longer / has capitals)
      if (name.length > existing.name.length && name !== slug) {
        existing.name = name;
      }
      return existing;
    }

    const entry: CharacterEntry = {
      slug,
      name,
      aliases: [],
      description: "",
      firstSeenChapter: chapter,
    };

    this.characters.set(slug, entry);
    this.aliasIndex.set(name.toLowerCase(), slug);
    return entry;
  }

  addAlias(slug: string, alias: string): void {
    const entry = this.characters.get(slug);
    if (entry && !entry.aliases.includes(alias)) {
      entry.aliases.push(alias);
      this.aliasIndex.set(alias.toLowerCase(), slug);
    }
  }

  /** Link identities when a reveal is discovered. */
  linkIdentity(reveal: IdentityReveal): void {
    this.reveals.push(reveal);
    const newEntry = this.characters.get(reveal.newSlug);
    const oldEntry = this.characters.get(reveal.previousSlug);
    if (newEntry && oldEntry) {
      newEntry.aliases.push(oldEntry.name, ...oldEntry.aliases);
      this.aliasIndex.set(oldEntry.name.toLowerCase(), reveal.newSlug);
    }
  }

  findByAlias(name: string): CharacterEntry | undefined {
    const slug = this.aliasIndex.get(name.toLowerCase());
    if (slug) return this.characters.get(slug);
    return undefined;
  }

  has(slug: string): boolean {
    return this.characters.has(slug);
  }

  get(slug: string): CharacterEntry | undefined {
    return this.characters.get(slug);
  }

  get size(): number {
    return this.characters.size;
  }

  /** Build the context string for the agent prompt. */
  toPromptContext(): string {
    if (this.characters.size === 0) {
      return "No characters discovered yet.";
    }

    const lines: string[] = [];
    for (const char of this.characters.values()) {
      const aliases = char.aliases.length > 0 ? ` (aliases: ${char.aliases.join(", ")})` : "";
      lines.push(
        `- ${char.slug}: "${char.name}"${aliases} [first seen: ch${char.firstSeenChapter}]`,
      );
    }

    if (this.reveals.length > 0) {
      lines.push("");
      lines.push("Identity reveals:");
      for (const r of this.reveals) {
        lines.push(`- "${r.previousSlug}" revealed as "${r.newSlug}" in ch${r.chapterNumber}`);
      }
    }

    return lines.join("\n");
  }

  toJSON(): { characters: CharacterEntry[]; reveals: IdentityReveal[] } {
    return { characters: Array.from(this.characters.values()), reveals: this.reveals };
  }
}
