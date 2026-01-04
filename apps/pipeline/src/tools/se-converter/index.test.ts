import { describe, it, expect } from "vitest";
import { convertSeXhtmlToHtml } from "./index";

describe("SE Converter", () => {
  describe("simple chapters (no nesting)", () => {
    it("converts a single chapter file to one chapter", () => {
      const files = [
        {
          filename: "chapter-1.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Chapter 1</title></head>
  <body epub:type="bodymatter">
    <section id="chapter-1" epub:type="chapter">
      <h2 epub:type="title">The Beginning</h2>
      <p>Once upon a time...</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.lastChapter).toBe(1);
      expect(result.textHtml).toContain('data-chapter="1"');
      expect(result.textHtml).toContain("The Beginning");
      expect(result.textHtml).toContain("Once upon a time...");
    });

    it("converts multiple chapter files in order", () => {
      const files = [
        {
          filename: "chapter-1.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="chapter-1" epub:type="chapter">
      <h2>Chapter One</h2>
      <p>First chapter content.</p>
    </section>
  </body>
</html>`,
        },
        {
          filename: "chapter-2.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="chapter-2" epub:type="chapter">
      <h2>Chapter Two</h2>
      <p>Second chapter content.</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.lastChapter).toBe(2);
      expect(result.textHtml).toContain('data-chapter="1"');
      expect(result.textHtml).toContain('data-chapter="2"');
      expect(result.textHtml.indexOf("Chapter One")).toBeLessThan(result.textHtml.indexOf("Chapter Two"));
    });
  });

  describe("part dividers (like Triplanetary)", () => {
    it("includes part dividers as chapters", () => {
      const files = [
        {
          filename: "book-1.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="book-1" epub:type="part">
      <hgroup>
        <h2><span epub:type="label">Book</span> <span epub:type="ordinal z3998:roman">I</span></h2>
        <p epub:type="title">Dawn</p>
      </hgroup>
    </section>
  </body>
</html>`,
        },
        {
          filename: "chapter-1.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section data-parent="book-1" id="chapter-1" epub:type="chapter">
      <h3 epub:type="ordinal z3998:roman">I</h3>
      <p>First chapter of Book I.</p>
    </section>
  </body>
</html>`,
        },
        {
          filename: "chapter-2.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section data-parent="book-1" id="chapter-2" epub:type="chapter">
      <h3 epub:type="ordinal z3998:roman">II</h3>
      <p>Second chapter of Book I.</p>
    </section>
  </body>
</html>`,
        },
        {
          filename: "book-2.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="book-2" epub:type="part">
      <hgroup>
        <h2><span epub:type="label">Book</span> <span epub:type="ordinal z3998:roman">II</span></h2>
        <p epub:type="title">Awakening</p>
      </hgroup>
    </section>
  </body>
</html>`,
        },
        {
          filename: "chapter-3.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section data-parent="book-2" id="chapter-3" epub:type="chapter">
      <h3 epub:type="ordinal z3998:roman">III</h3>
      <p>First chapter of Book II.</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.lastChapter).toBe(5);
      expect(result.textHtml).toContain('data-chapter="1"');
      expect(result.textHtml).toContain('data-chapter="2"');
      expect(result.textHtml).toContain('data-chapter="3"');
      expect(result.textHtml).toContain('data-chapter="4"');
      expect(result.textHtml).toContain('data-chapter="5"');
      expect(result.textHtml).toContain("Book");
      expect(result.textHtml).toContain("Dawn");
    });
  });

  describe("nested sections (like Asimov short stories)", () => {
    it("promotes nested epub:type=chapter sections to top-level chapters", () => {
      const files = [
        {
          filename: "youth.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <article id="youth" epub:type="se:short-story">
      <h2 epub:type="title">Youth</h2>
      <section id="youth-1" epub:type="chapter">
        <h3 epub:type="ordinal z3998:roman">I</h3>
        <p>Section one content.</p>
      </section>
      <section id="youth-2" epub:type="chapter">
        <h3 epub:type="ordinal z3998:roman">II</h3>
        <p>Section two content.</p>
      </section>
      <section id="youth-3" epub:type="chapter">
        <h3 epub:type="ordinal z3998:roman">III</h3>
        <p>Section three content.</p>
      </section>
    </article>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.lastChapter).toBe(3);
      expect(result.textHtml).toContain('data-chapter="1"');
      expect(result.textHtml).toContain('data-chapter="2"');
      expect(result.textHtml).toContain('data-chapter="3"');
      expect(result.textHtml).toContain("Section one content");
      expect(result.textHtml).toContain("Section two content");
      expect(result.textHtml).toContain("Section three content");
    });

    it("includes preamble content in the first promoted section", () => {
      const files = [
        {
          filename: "story.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <article id="story" epub:type="se:short-story">
      <h2 epub:type="title">The Story</h2>
      <p>This is the preamble before any sections.</p>
      <p>More preamble text here.</p>
      <section id="story-1" epub:type="chapter">
        <h3>Part One</h3>
        <p>First part content.</p>
      </section>
      <section id="story-2" epub:type="chapter">
        <h3>Part Two</h3>
        <p>Second part content.</p>
      </section>
    </article>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.lastChapter).toBe(2);
      expect(result.textHtml).toContain("preamble before any sections");
      expect(result.textHtml).toContain("First part content");
      const chapter1Match = result.textHtml.match(/data-chapter="1"[\s\S]*?data-chapter="2"/);
      expect(chapter1Match).toBeTruthy();
      expect(chapter1Match![0]).toContain("preamble");
    });

    it("does NOT promote sections without epub:type=chapter", () => {
      const files = [
        {
          filename: "chapter.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="chapter-1" epub:type="chapter">
      <h2>Main Chapter</h2>
      <p>Intro paragraph.</p>
      <section id="subsection-a">
        <h3>Subsection A</h3>
        <p>Subsection A content.</p>
      </section>
      <section id="subsection-b">
        <h3>Subsection B</h3>
        <p>Subsection B content.</p>
      </section>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.lastChapter).toBe(1);
      expect(result.textHtml).toContain('data-chapter="1"');
      expect(result.textHtml).not.toContain('data-chapter="2"');
      expect(result.textHtml).toContain("Subsection A content");
      expect(result.textHtml).toContain("Subsection B content");
    });

    it("does NOT promote z3998:subchapter sections (only exact chapter match)", () => {
      const files = [
        {
          filename: "chapter-2.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section data-parent="book-1" id="chapter-2" epub:type="chapter">
      <h2>Chapter II</h2>
      <p>Chapter intro.</p>
      <section id="chapter-2-1" epub:type="z3998:subchapter">
        <h3>1</h3>
        <p>Subchapter 1 content.</p>
      </section>
      <section id="chapter-2-2" epub:type="z3998:subchapter">
        <h3>2</h3>
        <p>Subchapter 2 content.</p>
      </section>
      <section id="chapter-2-3" epub:type="z3998:subchapter">
        <h3>3</h3>
        <p>Subchapter 3 content.</p>
      </section>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.lastChapter).toBe(1);
      expect(result.textHtml).toContain('data-chapter="1"');
      expect(result.textHtml).not.toContain('data-chapter="2"');
      expect(result.textHtml).toContain("Subchapter 1 content");
      expect(result.textHtml).toContain("Subchapter 2 content");
      expect(result.textHtml).toContain("Subchapter 3 content");
    });
  });

  describe("mixed content", () => {
    it("handles a mix of simple chapters and nested chapters", () => {
      const files = [
        {
          filename: "everest.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <article id="everest" epub:type="se:short-story">
      <h2 epub:type="title">Everest</h2>
      <p>A simple short story with no subsections.</p>
    </article>
  </body>
</html>`,
        },
        {
          filename: "youth.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <article id="youth" epub:type="se:short-story">
      <h2 epub:type="title">Youth</h2>
      <section id="youth-1" epub:type="chapter">
        <h3>I</h3>
        <p>Youth section 1.</p>
      </section>
      <section id="youth-2" epub:type="chapter">
        <h3>II</h3>
        <p>Youth section 2.</p>
      </section>
    </article>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.lastChapter).toBe(3);
      expect(result.textHtml).toContain("simple short story");
      expect(result.textHtml).toContain("Youth section 1");
      expect(result.textHtml).toContain("Youth section 2");
    });
  });

  describe("XML/HTML conversion", () => {
    it("converts epub:type to data-epub-type", () => {
      const files = [
        {
          filename: "chapter.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section epub:type="chapter">
      <h2 epub:type="title">Test</h2>
      <p>Content.</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.textHtml).toContain('data-epub-type="title"');
      expect(result.textHtml).not.toContain('epub:type="title"');
    });

    it("converts &#160; entities correctly", () => {
      const files = [
        {
          filename: "chapter.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <section>
      <h2>Test</h2>
      <p>Hello&#160;World</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.textHtml).toContain("Hello");
      expect(result.textHtml).toContain("World");
    });
  });
});
