import { describe, it, expect } from "vitest";
import { parseChapters, recompileXml } from "./xmlParser";

describe("xmlParser", () => {
  describe("parseChapters", () => {
    it("parses simple chapters without nested sections", () => {
      const xml = `<?xml version="1.0"?>
<main>
<body><section data-chapter="1"><h2>Chapter 1</h2><p>Content 1</p></section>
<section data-chapter="2"><h2>Chapter 2</h2><p>Content 2</p></section>
</body>
</main>`;

      const { chapters } = parseChapters(xml);

      expect(chapters).toHaveLength(2);
      expect(chapters[0].originalIndex).toBe(1);
      expect(chapters[0].title).toBe("Chapter 1");
      expect(chapters[1].originalIndex).toBe(2);
      expect(chapters[1].title).toBe("Chapter 2");
    });

    it("handles chapters with nested sections (Paradise Lost structure)", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<main>
<body><section data-chapter="1" data-epub-type="chapter">
<h2>Book I</h2>
<section id="argument-1" data-epub-type="preamble">
<p>The Argument.</p>
</section>
<section id="poem-1" data-epub-type="z3998:poem">
<p>The poem content.</p>
</section>
</section>
<section data-chapter="2" data-epub-type="chapter">
<h2>Book II</h2>
<section id="argument-2" data-epub-type="preamble">
<p>The Argument 2.</p>
</section>
<section id="poem-2" data-epub-type="z3998:poem">
<p>The poem 2 content.</p>
</section>
</section>
</body>
</main>`;

      const { chapters } = parseChapters(xml);

      // Should find exactly 2 chapters (nested sections don't have data-chapter)
      expect(chapters).toHaveLength(2);
      expect(chapters[0].title).toBe("Book I");
      expect(chapters[1].title).toBe("Book II");
    });

    it("returns empty chapters array when no chapters exist", () => {
      const xml = `<main><body><p>No chapters here</p></body></main>`;

      const { chapters } = parseChapters(xml);

      expect(chapters).toHaveLength(0);
    });

    it("uses fallback title when chapter has no heading", () => {
      const xml = `<main><body><section data-chapter="1"><p>Content without heading</p></section></body></main>`;

      const { chapters } = parseChapters(xml);

      expect(chapters[0].title).toBe("Chapter 1");
    });

    it("uses fallback title when heading has empty text", () => {
      const xml = `<main><body><section data-chapter="1"><h2>   </h2><p>Content</p></section></body></main>`;

      const { chapters } = parseChapters(xml);

      expect(chapters[0].title).toBe("Chapter 1");
    });

    it("truncates long titles to 50 characters", () => {
      const longTitle =
        "This is a very long chapter title that exceeds fifty characters and should be truncated";
      const xml = `<main><body><section data-chapter="1"><h2>${longTitle}</h2></section></body></main>`;

      const { chapters } = parseChapters(xml);

      expect(chapters[0].title).toHaveLength(50);
      expect(chapters[0].title).toBe("This is a very long chapter title that exceeds ...");
    });

    it("preserves originalXml for recompilation", () => {
      const xml = `<main><body><section data-chapter="1"><h2>Ch</h2></section></body></main>`;

      const { originalXml } = parseChapters(xml);

      expect(originalXml).toBe(xml);
    });
  });

  describe("recompileXml", () => {
    it("produces balanced XML when chapters have nested sections", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<main>
<body><section data-chapter="1" data-epub-type="chapter">
<h2>Book I</h2>
<section id="argument-1" data-epub-type="preamble">
<p>The Argument.</p>
</section>
<section id="poem-1" data-epub-type="z3998:poem">
<p>The poem content.</p>
</section>
</section>
<section data-chapter="2" data-epub-type="chapter">
<h2>Book II</h2>
<section id="argument-2" data-epub-type="preamble">
<p>The Argument 2.</p>
</section>
<section id="poem-2" data-epub-type="z3998:poem">
<p>The poem 2 content.</p>
</section>
</section>
</body>
</main>`;

      const { originalXml, chapters } = parseChapters(xml);
      const compiled = recompileXml(originalXml, chapters);

      // CRITICAL: The compiled XML must have balanced section tags
      const opens = (compiled.match(/<section/g) || []).length;
      const closes = (compiled.match(/<\/section>/g) || []).length;

      expect(closes).toBe(opens);
    });

    it("renumbers chapters correctly", () => {
      const xml = `<main><body><section data-chapter="5"><h2>Ch</h2></section><section data-chapter="10"><h2>Ch</h2></section></body></main>`;

      const { originalXml, chapters } = parseChapters(xml);
      const compiled = recompileXml(originalXml, chapters);

      expect(compiled).toContain('data-chapter="1"');
      expect(compiled).toContain('data-chapter="2"');
      expect(compiled).not.toContain('data-chapter="5"');
      expect(compiled).not.toContain('data-chapter="10"');
    });

    it("only includes selected chapters", () => {
      const xml = `<main><body><section data-chapter="1"><h2>One</h2></section><section data-chapter="2"><h2>Two</h2></section></body></main>`;

      const { originalXml, chapters } = parseChapters(xml);
      chapters[1].selected = false; // Deselect chapter 2

      const compiled = recompileXml(originalXml, chapters);

      expect(compiled).toContain('data-chapter="1"');
      expect(compiled).not.toContain('data-chapter="2"');
      expect(compiled).not.toContain("Two");
    });

    it("preserves document structure (wrapper elements, attributes)", () => {
      const xml = `<?xml version="1.0"?><root id="doc" lang="en"><wrapper class="content"><section data-chapter="1"><h2>Ch1</h2></section></wrapper></root>`;

      const { originalXml, chapters } = parseChapters(xml);
      const compiled = recompileXml(originalXml, chapters);

      // Should preserve root element with attributes
      expect(compiled).toContain("<root");
      expect(compiled).toContain("</root>");
      // Should preserve wrapper
      expect(compiled).toContain("<wrapper");
      expect(compiled).toContain("</wrapper>");
    });

    it("preserves content before and after chapters", () => {
      const xml = `<doc><header><title>Book Title</title></header><body><section data-chapter="1"><h2>Ch</h2></section></body><footer>The End</footer></doc>`;

      const { originalXml, chapters } = parseChapters(xml);
      const compiled = recompileXml(originalXml, chapters);

      expect(compiled).toContain("<title>Book Title</title>");
      expect(compiled).toContain("<footer>The End</footer>");
    });

    it("handles removing all chapters gracefully", () => {
      const xml = `<doc><body><section data-chapter="1"><h2>Ch1</h2></section><section data-chapter="2"><h2>Ch2</h2></section></body></doc>`;

      const { originalXml, chapters } = parseChapters(xml);
      chapters.forEach((c) => (c.selected = false));

      const compiled = recompileXml(originalXml, chapters);

      // Document structure preserved, but no chapters
      expect(compiled).toContain("<doc>");
      expect(compiled).toContain("</doc>");
      expect(compiled).not.toContain("data-chapter");
    });

    it("preserves nested sections inside chapters", () => {
      const xml = `<main><body><section data-chapter="1"><h2>Book I</h2><section id="nested"><p>Nested content</p></section></section></body></main>`;

      const { originalXml, chapters } = parseChapters(xml);
      const compiled = recompileXml(originalXml, chapters);

      expect(compiled).toContain("Nested content");
      expect(compiled).toContain('id="nested"');
    });
  });
});
