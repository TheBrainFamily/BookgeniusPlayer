import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { applyAnnotations } from "../annotation-applier";
import type { ChapterAnnotations } from "../../types";

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

describe("applyAnnotations", () => {
  it("applies a speaker annotation", () => {
    const filePath = writeFixture(
      "ch1.xhtml",
      '<section><p>"Good morning," said the doctor.</p></section>',
    );

    const annotations: ChapterAnnotations = {
      annotations: [
        {
          searchText: '"Good morning," said the doctor.',
          wrapText: '"Good morning,"',
          type: "speaker",
          slug: "doctor",
        },
      ],
      containerAnnotations: [],
      newCharacters: [],
    };

    const result = applyAnnotations(filePath, annotations);
    expect(result.applied).toBe(1);
    expect(result.failed).toHaveLength(0);

    const output = readFileSync(filePath, "utf-8");
    expect(output).toContain('<span data-speaker="doctor">"Good morning,"</span>');
  });

  it("applies a mention annotation", () => {
    const filePath = writeFixture(
      "ch1.xhtml",
      "<section><p>Henry Clerval arrived at the inn.</p></section>",
    );

    const annotations: ChapterAnnotations = {
      annotations: [
        {
          searchText: "Henry Clerval arrived at the inn.",
          wrapText: "Henry Clerval",
          type: "mention",
          slug: "henry-clerval",
        },
      ],
      containerAnnotations: [],
      newCharacters: [],
    };

    const result = applyAnnotations(filePath, annotations);
    expect(result.applied).toBe(1);

    const output = readFileSync(filePath, "utf-8");
    expect(output).toContain('<span data-c="henry-clerval">Henry Clerval</span>');
  });

  it("applies a data-reveals annotation", () => {
    const filePath = writeFixture(
      "ch5.xhtml",
      '<section><p>"I am Inspector Japp," he said.</p></section>',
    );

    const annotations: ChapterAnnotations = {
      annotations: [
        {
          searchText: '"I am Inspector Japp," he said.',
          wrapText: '"I am Inspector Japp,"',
          type: "speaker",
          slug: "inspector-japp",
          reveals: "mysterious-stranger",
        },
      ],
      containerAnnotations: [],
      newCharacters: [],
    };

    const result = applyAnnotations(filePath, annotations);
    expect(result.applied).toBe(1);

    const output = readFileSync(filePath, "utf-8");
    expect(output).toContain(
      '<span data-speaker="inspector-japp" data-reveals="mysterious-stranger">"I am Inspector Japp,"</span>',
    );
  });

  it("applies a container annotation", () => {
    const filePath = writeFixture(
      "ch1.xhtml",
      `<section><blockquote epub:type="z3998:letter">
  <p>Dear friend, I write to you.</p>
</blockquote></section>`,
    );

    const annotations: ChapterAnnotations = {
      annotations: [],
      containerAnnotations: [
        { searchText: "Dear friend, I write to you.", tag: "blockquote", slug: "robert-walton" },
      ],
      newCharacters: [],
    };

    const result = applyAnnotations(filePath, annotations);
    expect(result.containerApplied).toBe(1);

    const output = readFileSync(filePath, "utf-8");
    expect(output).toContain('data-speaker="robert-walton"');
  });

  it("reports failed annotations when searchText not found", () => {
    const filePath = writeFixture("ch1.xhtml", "<section><p>Hello world.</p></section>");

    const annotations: ChapterAnnotations = {
      annotations: [
        {
          searchText: "This text does not exist in the file",
          wrapText: "does not exist",
          type: "speaker",
          slug: "nobody",
        },
      ],
      containerAnnotations: [],
      newCharacters: [],
    };

    const result = applyAnnotations(filePath, annotations);
    expect(result.applied).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].slug).toBe("nobody");
  });

  it("applies multiple annotations in sequence", () => {
    const filePath = writeFixture(
      "ch1.xhtml",
      '<section><p>"Hello," said Alice. "Goodbye," said Bob.</p></section>',
    );

    const annotations: ChapterAnnotations = {
      annotations: [
        {
          searchText: '"Hello," said Alice.',
          wrapText: '"Hello,"',
          type: "speaker",
          slug: "alice",
        },
        {
          searchText: '"Goodbye," said Bob.',
          wrapText: '"Goodbye,"',
          type: "speaker",
          slug: "bob",
        },
      ],
      containerAnnotations: [],
      newCharacters: [],
    };

    const result = applyAnnotations(filePath, annotations);
    expect(result.applied).toBe(2);

    const output = readFileSync(filePath, "utf-8");
    expect(output).toContain('<span data-speaker="alice">"Hello,"</span>');
    expect(output).toContain('<span data-speaker="bob">"Goodbye,"</span>');
  });
});
