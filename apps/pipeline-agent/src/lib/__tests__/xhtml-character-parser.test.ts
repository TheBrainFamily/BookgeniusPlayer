import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { parseCharactersFromXhtml, toCharacterEntries } from "../xhtml-character-parser";

const TEST_DIR = join(import.meta.dir, "__fixtures__");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function writeFixture(filename: string, content: string): string {
  const filePath = join(TEST_DIR, filename);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("parseCharactersFromXhtml", () => {
  it("extracts data-c character mentions with names from text content", () => {
    const filePath = writeFixture(
      "ch1.xhtml",
      `<section>
        <p><span data-c="hercule-poirot">Hercule Poirot</span> entered the room.</p>
      </section>`,
    );

    const result = parseCharactersFromXhtml(filePath, 1);
    expect(result.characters.size).toBe(1);
    expect(result.characters.get("hercule-poirot")).toEqual({
      slug: "hercule-poirot",
      name: "Hercule Poirot",
    });
  });

  it("extracts data-speaker attributes", () => {
    const filePath = writeFixture(
      "ch1.xhtml",
      `<section>
        <p><span data-speaker="dr-sheppard">"Good morning,"</span> he said.</p>
      </section>`,
    );

    const result = parseCharactersFromXhtml(filePath, 1);
    expect(result.characters.has("dr-sheppard")).toBe(true);
  });

  it("prefers data-c name over data-speaker slug", () => {
    const filePath = writeFixture(
      "ch1.xhtml",
      `<section>
        <p><span data-c="dr-sheppard">Dr. Sheppard</span> said: <span data-speaker="dr-sheppard">"Hello."</span></p>
      </section>`,
    );

    const result = parseCharactersFromXhtml(filePath, 1);
    expect(result.characters.get("dr-sheppard")!.name).toBe("Dr. Sheppard");
  });

  it("detects data-reveals attributes", () => {
    const filePath = writeFixture(
      "ch5.xhtml",
      `<section>
        <p><span data-speaker="inspector-japp" data-reveals="mysterious-stranger">"I am Japp,"</span> he said.</p>
      </section>`,
    );

    const result = parseCharactersFromXhtml(filePath, 5);
    expect(result.reveals).toHaveLength(1);
    expect(result.reveals[0]).toEqual({
      newSlug: "inspector-japp",
      previousSlug: "mysterious-stranger",
      chapterNumber: 5,
    });
  });

  it("handles multiple characters in one file", () => {
    const filePath = writeFixture(
      "ch2.xhtml",
      `<section>
        <p><span data-c="alice">Alice</span> talked to <span data-c="bob">Bob</span>.</p>
        <p><span data-speaker="alice">"Hello,"</span> she said.</p>
        <p><span data-speaker="charlie">"Hi,"</span> said the newcomer.</p>
      </section>`,
    );

    const result = parseCharactersFromXhtml(filePath, 2);
    expect(result.characters.size).toBe(3);
    expect(result.characters.has("alice")).toBe(true);
    expect(result.characters.has("bob")).toBe(true);
    expect(result.characters.has("charlie")).toBe(true);
  });

  it("handles file with no character annotations", () => {
    const filePath = writeFixture(
      "ch0.xhtml",
      `<section><p>A dedication page with no characters.</p></section>`,
    );

    const result = parseCharactersFromXhtml(filePath, 0);
    expect(result.characters.size).toBe(0);
    expect(result.reveals).toHaveLength(0);
  });
});

describe("toCharacterEntries", () => {
  it("converts parsed characters to CharacterEntry objects", () => {
    const filePath = writeFixture(
      "ch1.xhtml",
      `<section>
        <p><span data-c="hercule-poirot">Hercule Poirot</span> arrived.</p>
      </section>`,
    );

    const parsed = parseCharactersFromXhtml(filePath, 1);
    const entries = toCharacterEntries(parsed, 1);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      slug: "hercule-poirot",
      name: "Hercule Poirot",
      aliases: [],
      description: "",
      firstSeenChapter: 1,
    });
  });
});
