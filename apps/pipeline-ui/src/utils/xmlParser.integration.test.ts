import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { parseChapters, recompileXml } from "./xmlParser";

/**
 * Integration tests using real book data from the pipeline.
 * These tests verify the xmlParser works correctly with actual book content.
 */
describe("xmlParser integration", () => {
  describe("Paradise Lost (Standard Ebooks)", () => {
    // Vitest runs from monorepo root (where vitest.config.ts is)
    const paradiseLostPath = resolve(
      process.cwd(),
      "apps/pipeline/books-data/john-milton_paradise-lost/input/rich.xml",
    );

    let xml: string;
    try {
      xml = existsSync(paradiseLostPath) ? readFileSync(paradiseLostPath, "utf-8") : "";
    } catch {
      xml = "";
    }

    it.skipIf(!xml)("parses all 12 books correctly", () => {
      const { chapters } = parseChapters(xml);

      expect(chapters).toHaveLength(12);
      expect(chapters[0].title).toContain("Book");
      expect(chapters[11].title).toContain("Book");
    });

    it.skipIf(!xml)("each chapter contains nested sections (preamble + poem)", () => {
      const { chapters } = parseChapters(xml);

      for (const chapter of chapters) {
        // Each Paradise Lost chapter has nested sections
        const sectionCount = (chapter.content.match(/<section/g) || []).length;
        expect(sectionCount).toBeGreaterThanOrEqual(2); // At least outer + one nested
      }
    });

    it.skipIf(!xml)("round-trip produces valid XML with all chapters", () => {
      const { originalXml, chapters } = parseChapters(xml);
      const compiled = recompileXml(originalXml, chapters);

      // Should have balanced tags
      const opens = (compiled.match(/<section/g) || []).length;
      const closes = (compiled.match(/<\/section>/g) || []).length;
      expect(closes).toBe(opens);

      // Should contain all chapter content
      expect(compiled).toContain("data-chapter=");
      expect(compiled).toMatch(/Of Man.s first disobedience/); // Famous opening line
    });

    it.skipIf(!xml)("deselecting chapters removes them from output", () => {
      const { originalXml, chapters } = parseChapters(xml);

      // Deselect books 2-11, keep only first and last
      chapters.forEach((c, i) => {
        c.selected = i === 0 || i === 11;
      });

      const compiled = recompileXml(originalXml, chapters);

      // Should only have 2 chapters
      expect(compiled).toContain('data-chapter="1"');
      expect(compiled).toContain('data-chapter="2"'); // Renumbered from 12
      expect(compiled).not.toContain('data-chapter="3"');
    });

    it.skipIf(!xml)("preserves document structure (main, body tags)", () => {
      const { originalXml, chapters } = parseChapters(xml);
      const compiled = recompileXml(originalXml, chapters);

      expect(compiled).toContain("<main>");
      expect(compiled).toContain("</main>");
      expect(compiled).toContain("<body>");
      expect(compiled).toContain("</body>");
    });
  });
});
