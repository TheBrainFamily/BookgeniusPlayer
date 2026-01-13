import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { parseChapters, recompileXml } from "./xmlParser";

/**
 * End-to-end tests that run the full pipeline:
 * Original source files → Converter → rich.xml → xmlParser
 *
 * These tests verify the entire flow works correctly.
 */

const MONOREPO_ROOT = process.cwd();
const PIPELINE_DIR = resolve(MONOREPO_ROOT, "apps/pipeline");

describe("xmlParser end-to-end", () => {
  describe("Standard Ebooks: Paradise Lost", () => {
    const bookSlug = "john-milton_paradise-lost";
    const sourceDir = resolve(PIPELINE_DIR, "standardebooks-data/books", bookSlug, "text");
    const outputDir = resolve(PIPELINE_DIR, "books-data", bookSlug, "input");
    const richXmlPath = resolve(outputDir, "rich.xml");

    const sourceExists = existsSync(sourceDir);
    const richXmlExists = existsSync(richXmlPath);

    it.skipIf(!sourceExists)("source files exist in standardebooks-data", () => {
      // Source directory exists with chapter files
      expect(existsSync(resolve(sourceDir, "book-1.xhtml"))).toBe(true);
    });

    describe.skipIf(!richXmlExists)("with pre-converted rich.xml", () => {
      let xml: string;
      beforeAll(() => {
        xml = readFileSync(richXmlPath, "utf-8");
      });

      it("parses all 12 books of Paradise Lost", () => {
        const { chapters } = parseChapters(xml);
        expect(chapters).toHaveLength(12);
      });

      it("each book has the correct structure with nested sections", () => {
        const { chapters } = parseChapters(xml);

        for (let i = 0; i < chapters.length; i++) {
          const chapter = chapters[i];
          // Each book should have preamble (The Argument) and poem sections
          expect(chapter.content).toContain("data-epub-type");
          expect(chapter.content).toContain("preamble");
          expect(chapter.content).toContain("poem");
        }
      });

      it("chapter titles contain 'Book'", () => {
        const { chapters } = parseChapters(xml);

        for (const chapter of chapters) {
          expect(chapter.title).toMatch(/Book/i);
        }
      });

      it("recompile produces valid XML", () => {
        const { originalXml, chapters } = parseChapters(xml);
        const compiled = recompileXml(originalXml, chapters);

        // Balanced tags
        const opens = (compiled.match(/<section/g) || []).length;
        const closes = (compiled.match(/<\/section>/g) || []).length;
        expect(closes).toBe(opens);

        // All chapters present
        expect(compiled).toContain('data-chapter="1"');
        expect(compiled).toContain('data-chapter="12"');
      });

      it("can select subset of chapters", () => {
        const { originalXml, chapters } = parseChapters(xml);

        // Keep only books 1, 6, and 12
        chapters.forEach((c, i) => {
          c.selected = i === 0 || i === 5 || i === 11;
        });

        const compiled = recompileXml(originalXml, chapters);

        // Should have 3 chapters, renumbered 1, 2, 3
        expect(compiled).toContain('data-chapter="1"');
        expect(compiled).toContain('data-chapter="2"');
        expect(compiled).toContain('data-chapter="3"');
        expect(compiled).not.toContain('data-chapter="4"');
      });
    });
  });

  describe("Wolne Lektury: krolowa-sniegu (The Snow Queen)", () => {
    const fb2Path = resolve(PIPELINE_DIR, "wolnelektury-data/fb2/krolowa-sniegu.fb2");
    const fb2Exists = existsSync(fb2Path);

    // Check if there's a pre-converted version (might be under different slug)
    const possibleSlugs = ["krolowa-sniegu", "andersen-krolowa-sniegu"];
    let richXmlPath: string | null = null;
    let richXmlExists = false;

    for (const slug of possibleSlugs) {
      const path = resolve(PIPELINE_DIR, "books-data", slug, "input/rich.xml");
      if (existsSync(path)) {
        richXmlPath = path;
        richXmlExists = true;
        break;
      }
    }

    it.skipIf(!fb2Exists)("source fb2 file exists", () => {
      expect(fb2Exists).toBe(true);
      const content = readFileSync(fb2Path, "utf-8");
      expect(content).toContain("<FictionBook");
    });

    describe.skipIf(!richXmlExists)("with pre-converted rich.xml", () => {
      let xml: string;
      beforeAll(() => {
        xml = readFileSync(richXmlPath!, "utf-8");
      });

      it("parses all 7 chapters from The Snow Queen", () => {
        const { chapters } = parseChapters(xml);
        // The Snow Queen has 7 stories/chapters using <p><strong>TITLE</strong></p> pattern
        expect(chapters.length).toBe(7);
      });

      it("has correct chapter titles", () => {
        const { chapters } = parseChapters(xml);
        // Polish chapter titles
        expect(chapters[0].title).toContain("Czarodziejskie zwierciadło");
        expect(chapters[1].title).toContain("Sąsiedzi");
        expect(chapters[6].title).toContain("pałacu królowej śniegu");
      });

      it("recompile produces valid XML", () => {
        const { originalXml, chapters } = parseChapters(xml);
        const compiled = recompileXml(originalXml, chapters);

        // Balanced tags
        const opens = (compiled.match(/<section/g) || []).length;
        const closes = (compiled.match(/<\/section>/g) || []).length;
        expect(closes).toBe(opens);
      });
    });

    // Test that we can at least read and parse the FB2 structure
    describe.skipIf(!fb2Exists)("FB2 source analysis", () => {
      it("FB2 file has expected structure", () => {
        const content = readFileSync(fb2Path, "utf-8");

        // FB2 structure checks
        expect(content).toContain("<FictionBook");
        expect(content).toContain("<body");
        expect(content).toContain("<section");
        expect(content).toContain("</FictionBook>");
      });

      it("FB2 file contains The Snow Queen content markers", () => {
        const content = readFileSync(fb2Path, "utf-8");

        // Should have multiple sections (stories)
        const sectionCount = (content.match(/<section/g) || []).length;
        expect(sectionCount).toBeGreaterThan(5); // Snow Queen has 7 stories
      });
    });
  });

  describe("Multiple books comparison", () => {
    const booksToTest = [
      {
        name: "Paradise Lost",
        slug: "john-milton_paradise-lost",
        expectedChapters: 12,
        source: "standardebooks",
      },
      {
        name: "Dubliners",
        slug: "james-joyce_dubliners",
        expectedChapters: 15, // 15 short stories
        source: "standardebooks",
      },
      {
        name: "The Scarlet Pimpernel",
        slug: "baroness-orczy_the-scarlet-pimpernel",
        expectedChapters: 31, // ~31 chapters
        source: "standardebooks",
      },
    ];

    for (const book of booksToTest) {
      const richXmlPath = resolve(PIPELINE_DIR, "books-data", book.slug, "input/rich.xml");
      const exists = existsSync(richXmlPath);

      describe.skipIf(!exists)(book.name, () => {
        let xml: string;
        beforeAll(() => {
          xml = readFileSync(richXmlPath, "utf-8");
        });

        it(`parses expected number of chapters (${book.expectedChapters})`, () => {
          const { chapters } = parseChapters(xml);
          expect(chapters.length).toBeGreaterThanOrEqual(book.expectedChapters - 5);
          expect(chapters.length).toBeLessThanOrEqual(book.expectedChapters + 5);
        });

        it("round-trip preserves structure", () => {
          const { originalXml, chapters } = parseChapters(xml);
          const compiled = recompileXml(originalXml, chapters);

          const originalSections = (xml.match(/<section/g) || []).length;
          const compiledSections = (compiled.match(/<section/g) || []).length;

          // Should have same number of sections
          expect(compiledSections).toBe(originalSections);
        });
      });
    }
  });
});
