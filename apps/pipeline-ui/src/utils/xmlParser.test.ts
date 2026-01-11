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

      const { preamble: _preamble, chapters, postamble: _postamble } = parseChapters(xml);

      expect(chapters).toHaveLength(2);
      expect(chapters[0].originalIndex).toBe(1);
      expect(chapters[0].title).toBe("Chapter 1");
      expect(chapters[1].originalIndex).toBe(2);
      expect(chapters[1].title).toBe("Chapter 2");
    });

    it("handles chapters with nested sections (Paradise Lost structure)", () => {
      // This is the critical test case - Paradise Lost has nested sections
      // that are NOT data-chapter sections (preamble, poem, etc.)
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

      // Should find exactly 2 chapters
      expect(chapters).toHaveLength(2);

      // Each chapter should contain ALL its nested sections
      // Chapter 1 should have 3 sections: outer + preamble + poem
      const ch1Opens = (chapters[0].content.match(/<section/g) || []).length;
      const ch1Closes = (chapters[0].content.match(/<\/section>/g) || []).length;
      expect(ch1Opens).toBe(3);
      expect(ch1Closes).toBe(3);

      // Chapter 2 should also have 3 sections
      const ch2Opens = (chapters[1].content.match(/<section/g) || []).length;
      const ch2Closes = (chapters[1].content.match(/<\/section>/g) || []).length;
      expect(ch2Opens).toBe(3);
      expect(ch2Closes).toBe(3);
    });

    it("preserves content inside nested sections", () => {
      const xml = `<?xml version="1.0"?>
<main>
<body><section data-chapter="1">
<h2>Book I</h2>
<section id="nested">
<p>Nested content should be preserved</p>
</section>
</section>
</body>
</main>`;

      const { chapters } = parseChapters(xml);

      expect(chapters[0].content).toContain("Nested content should be preserved");
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

      const { preamble, chapters, postamble } = parseChapters(xml);
      const compiled = recompileXml(preamble, chapters, postamble);

      // CRITICAL: The compiled XML must have balanced section tags
      const opens = (compiled.match(/<section/g) || []).length;
      const closes = (compiled.match(/<\/section>/g) || []).length;

      expect(closes).toBe(opens);
    });

    it("renumbers chapters correctly", () => {
      const xml = `<main><body><section data-chapter="5"><h2>Ch</h2></section><section data-chapter="10"><h2>Ch</h2></section></body></main>`;

      const { preamble, chapters, postamble } = parseChapters(xml);
      const compiled = recompileXml(preamble, chapters, postamble);

      expect(compiled).toContain('data-chapter="1"');
      expect(compiled).toContain('data-chapter="2"');
      expect(compiled).not.toContain('data-chapter="5"');
      expect(compiled).not.toContain('data-chapter="10"');
    });

    it("only includes selected chapters", () => {
      const xml = `<main><body><section data-chapter="1"><h2>One</h2></section><section data-chapter="2"><h2>Two</h2></section></body></main>`;

      const { preamble, chapters, postamble } = parseChapters(xml);
      chapters[1].selected = false; // Deselect chapter 2

      const compiled = recompileXml(preamble, chapters, postamble);

      expect(compiled).toContain('data-chapter="1"');
      expect(compiled).not.toContain('data-chapter="2"');
      expect(compiled).not.toContain("Two");
    });
  });
});
