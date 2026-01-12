import { describe, it, expect } from "vitest";
import { parseFb2Xml, convertFb2 } from "./fb2Converter";

describe("fb2Converter", () => {
  describe("parseFb2Xml", () => {
    it("parses valid FB2 XML", () => {
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <section>
              <title><p>Chapter 1</p></title>
              <p>Content here</p>
            </section>
          </body>
        </FictionBook>`;

      const doc = parseFb2Xml(xml);
      expect(doc.querySelector("FictionBook")).not.toBeNull();
      expect(doc.querySelector("body")).not.toBeNull();
    });

    it("adds XML declaration if missing", () => {
      const xml = `<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body><section><p>Content</p></section></body>
        </FictionBook>`;

      const doc = parseFb2Xml(xml);
      expect(doc.querySelector("FictionBook")).not.toBeNull();
    });
  });

  describe("convertFb2 - standard chapter detection", () => {
    it("detects chapters with title and content elements", () => {
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <section>
              <title><p>Chapter 1</p></title>
              <p>First chapter content.</p>
            </section>
            <section>
              <title><p>Chapter 2</p></title>
              <p>Second chapter content.</p>
            </section>
            <section>
              <title><p>Chapter 3</p></title>
              <p>Third chapter content.</p>
            </section>
          </body>
        </FictionBook>`;

      const result = convertFb2(xml);

      // Should detect 3 chapters
      expect(result.textHtml).toContain('data-chapter="0"');
      expect(result.textHtml).toContain('data-chapter="1"');
      expect(result.textHtml).toContain('data-chapter="2"');
      expect(result.textHtml).not.toContain('data-chapter="3"');

      // chaptersXml should have all chapters
      expect(result.chaptersXml).toContain('<chapter number="0">');
      expect(result.chaptersXml).toContain('<chapter number="1">');
      expect(result.chaptersXml).toContain('<chapter number="2">');
    });

    it("handles books without explicit chapters (single section)", () => {
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <section>
              <p>Just some content without title.</p>
              <p>More content here.</p>
            </section>
          </body>
        </FictionBook>`;

      const result = convertFb2(xml);

      // Should detect 1 chapter (the section with content)
      expect(result.textHtml).toContain('data-chapter="0"');
      expect(result.textHtml).not.toContain('data-chapter="1"');
    });
  });

  describe("convertFb2 - strong-based chapter detection fallback", () => {
    it("detects chapters from <p><strong>TITLE</strong></p> pattern when only 1 section exists", () => {
      // This is the pattern used in krolowa-sniegu
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <title>
              <p>Book Title</p>
            </title>
            <section>
              <p>
                <strong>I. First Chapter</strong>
              </p>
              <p>First chapter content here.</p>
              <p>More content for first chapter.</p>
              <p>
                <strong>II. Second Chapter</strong>
              </p>
              <p>Second chapter content here.</p>
              <p>
                <strong>III. Third Chapter</strong>
              </p>
              <p>Third chapter content.</p>
            </section>
          </body>
        </FictionBook>`;

      const result = convertFb2(xml);

      // Should detect 3 chapters based on <p><strong> pattern
      expect(result.textHtml).toContain('data-chapter="0"');
      expect(result.textHtml).toContain('data-chapter="1"');
      expect(result.textHtml).toContain('data-chapter="2"');
      expect(result.textHtml).not.toContain('data-chapter="3"');

      // chaptersXml should reflect the chapter titles
      expect(result.chaptersXml).toContain("I. First Chapter");
      expect(result.chaptersXml).toContain("II. Second Chapter");
      expect(result.chaptersXml).toContain("III. Third Chapter");
    });

    it("ignores <p><strong> that has sibling content (not a chapter header)", () => {
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <section>
              <p>
                <strong>I. First Chapter</strong>
              </p>
              <p>First chapter content.</p>
              <p>This is <strong>bold text</strong> within a paragraph.</p>
              <p>
                <strong>II. Second Chapter</strong>
              </p>
              <p>Second chapter content.</p>
            </section>
          </body>
        </FictionBook>`;

      const result = convertFb2(xml);

      // Should only detect 2 chapters (not the inline bold)
      expect(result.textHtml).toContain('data-chapter="0"');
      expect(result.textHtml).toContain('data-chapter="1"');
      expect(result.textHtml).not.toContain('data-chapter="2"');

      // Content should have the inline bold, not as a chapter
      expect(result.textHtml).toContain("bold text");
    });

    it("does not use strong fallback when standard chapters are found", () => {
      // Book with proper <title> elements should NOT trigger the fallback
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <section>
              <title><p>Chapter 1</p></title>
              <p>
                <strong>Some bold header</strong>
              </p>
              <p>Content here.</p>
            </section>
            <section>
              <title><p>Chapter 2</p></title>
              <p>Second chapter content.</p>
            </section>
          </body>
        </FictionBook>`;

      const result = convertFb2(xml);

      // Should detect 2 chapters from <title>, NOT split by <strong>
      expect(result.textHtml).toContain('data-chapter="0"');
      expect(result.textHtml).toContain('data-chapter="1"');
      expect(result.textHtml).not.toContain('data-chapter="2"');
    });

    it("works with krolowa-sniegu style content (Roman numeral prefixes)", () => {
      // Pattern from krolowa-sniegu: "I. Czarodziejskie zwierciadło", "II. Sąsiedzi", etc.
      // Note: No special handling for Roman numerals - they're just text content
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <section>
              <p>
                <strong>I. Czarodziejskie zwierciadło</strong>
              </p>
              <p>Żył sobie niegdyś bardzo złośliwy czarodziej.</p>
              <p>
                <strong>II. Sąsiedzi</strong>
              </p>
              <p>W pewnym bardzo starym mieście.</p>
              <p>
                <strong>III. W ogródku wróżki</strong>
              </p>
              <p>Jakże smutno i strasznie było biednej Gerdzie.</p>
              <p>
                <strong>IV. U księżniczki</strong>
              </p>
              <p>Długo szła tak Gerda.</p>
            </section>
          </body>
        </FictionBook>`;

      // Using startFromChapter: 1 as that's the production default
      const result = convertFb2(xml, { startFromChapter: 1 });

      // Should detect 4 chapters, numbered 1-4
      expect(result.chaptersXml).toContain('<chapter number="1">');
      expect(result.chaptersXml).toContain('<chapter number="2">');
      expect(result.chaptersXml).toContain('<chapter number="3">');
      expect(result.chaptersXml).toContain('<chapter number="4">');

      // Titles should be extracted correctly
      expect(result.chaptersXml).toContain("I. Czarodziejskie zwierciadło");
      expect(result.chaptersXml).toContain("II. Sąsiedzi");
      expect(result.chaptersXml).toContain("III. W ogródku wróżki");
      expect(result.chaptersXml).toContain("IV. U księżniczki");
    });

    it("requires <strong> to be only significant child of <p>", () => {
      // If <p> has text before/after <strong>, it's not a chapter header
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <section>
              <p>
                <strong>I. First Chapter</strong>
              </p>
              <p>Content.</p>
              <p>Prefix <strong>Not a chapter</strong> suffix</p>
              <p>More content.</p>
              <p>
                <strong>II. Second Chapter</strong>
              </p>
              <p>Second content.</p>
            </section>
          </body>
        </FictionBook>`;

      const result = convertFb2(xml);

      // Should only detect 2 chapters
      expect(result.textHtml).toContain('data-chapter="0"');
      expect(result.textHtml).toContain('data-chapter="1"');
      expect(result.textHtml).not.toContain('data-chapter="2"');
    });
  });

  describe("convertFb2 - excludes footnote sections", () => {
    it("excludes sections with id starting with fn (footnotes)", () => {
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <section>
              <title><p>Chapter 1</p></title>
              <p>Content with footnote ref<a type="note" href="#fn1">[1]</a></p>
            </section>
            <section id="fn1">
              <p>This is a footnote, not a chapter.</p>
            </section>
          </body>
        </FictionBook>`;

      const result = convertFb2(xml);

      // Should only have 1 chapter (not the footnote)
      expect(result.textHtml).toContain('data-chapter="0"');
      expect(result.textHtml).not.toContain('data-chapter="1"');
    });
  });

  describe("convertFb2 - chapter numbering with offset", () => {
    it("starts chapter numbering from specified offset", () => {
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <section>
              <title><p>Chapter A</p></title>
              <p>Content A</p>
            </section>
            <section>
              <title><p>Chapter B</p></title>
              <p>Content B</p>
            </section>
          </body>
        </FictionBook>`;

      const result = convertFb2(xml, { startFromChapter: 5 });

      // Chapter numbers should start from 5
      expect(result.textHtml).toContain('data-chapter="5"');
      expect(result.textHtml).toContain('data-chapter="6"');
      expect(result.chaptersXml).toContain('<chapter number="5">');
      expect(result.chaptersXml).toContain('<chapter number="6">');
    });
  });

  describe("convertFb2 - XML and HTML consistency", () => {
    it("should have consistent chapter counts between XML and HTML outputs for strong-based detection", () => {
      // Wolne Lektury style: single section with <p><strong>Title</strong></p> chapter markers
      // The strong-based fallback modifies the DOM, but both XML and HTML should detect the same chapters
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <section>
              <p><strong>Chapter 1</strong></p>
              <p>First chapter content.</p>
              <p><strong>Chapter 2</strong></p>
              <p>Second chapter content.</p>
              <p><strong>Chapter 3</strong></p>
              <p>Third chapter content.</p>
            </section>
          </body>
        </FictionBook>`;

      const result = convertFb2(xml);

      // Count chapters in XML output
      const xmlChapterMatches = result.chaptersXml.match(/<chapter number="/g);
      const xmlChapterCount = xmlChapterMatches ? xmlChapterMatches.length : 0;

      // Count chapters in HTML output
      const htmlChapterMatches = result.textHtml.match(/data-chapter="/g);
      const htmlChapterCount = htmlChapterMatches ? htmlChapterMatches.length : 0;

      // Both outputs should have the same number of chapters
      expect(xmlChapterCount).toBe(htmlChapterCount);
      expect(xmlChapterCount).toBe(3);

      // Both should include all chapter titles
      expect(result.chaptersXml).toContain("Chapter 1");
      expect(result.chaptersXml).toContain("Chapter 2");
      expect(result.chaptersXml).toContain("Chapter 3");
    });
  });

  describe("convertFb2 - strong fallback should not run when standard chapters exist", () => {
    it("should NOT trigger strong-based fallback when a standard chapter already exists", () => {
      // BUG: When identifyChapterSections finds 1 chapter (Prologue),
      // the condition `chapterSectionsSet.size <= 1` triggers the strong fallback,
      // which then REPLACES the result, losing the Prologue chapter entirely.
      //
      // Expected: 2 chapters (Prologue + second section treated as single chapter)
      // OR: Strong fallback should not trigger at all when we already have a valid chapter
      const xml = `<?xml version="1.0"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <body>
            <section>
              <title><p>Prologue</p></title>
              <p>Prologue content here.</p>
            </section>
            <section>
              <p><strong>Chapter 1</strong></p>
              <p>First chapter content.</p>
              <p><strong>Chapter 2</strong></p>
              <p>Second chapter content.</p>
            </section>
          </body>
        </FictionBook>`;

      const result = convertFb2(xml);

      // The Prologue should NOT be lost - it's a valid standard chapter
      expect(result.chaptersXml).toContain("Prologue");
      expect(result.textHtml).toContain("Prologue");
    });
  });
});
