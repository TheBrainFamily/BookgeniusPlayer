/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { convertXmlChapterToHtml, convertCompiledHtmlToSource, extractChapterMetadata } from "../xmlToHtmlConverter";

describe("convertXmlChapterToHtml", () => {
  it("converts Chapter wrapper to section", () => {
    const xml = '<Chapter id="2"><p>Hello</p></Chapter>';
    const html = convertXmlChapterToHtml(xml);
    expect(html).toContain('<section data-chapter="2">');
    expect(html).toContain("</section>");
  });

  it("converts character with talking=true to data-speaker on paragraph", () => {
    const xml = '<Chapter id="1"><p><Bob talking="true"/>Hello world</p></Chapter>';
    const html = convertXmlChapterToHtml(xml);
    expect(html).toContain('data-speaker="bob"');
    expect(html).not.toContain("<Bob");
  });

  it("converts character reference to data-c span", () => {
    const xml = '<Chapter id="1"><p>Hello <Bob>Bob Smith</Bob>!</p></Chapter>';
    const html = convertXmlChapterToHtml(xml);
    expect(html).toContain('<span data-c="bob">Bob Smith</span>');
  });

  it("handles hyphenated character names", () => {
    const xml = '<Chapter id="1"><p><Ignacy-Rzecki>Pan Ignacy</Ignacy-Rzecki></p></Chapter>';
    const html = convertXmlChapterToHtml(xml);
    expect(html).toContain('<span data-c="ignacy-rzecki">Pan Ignacy</span>');
  });

  it("converts note to anchor with data-note", () => {
    const xml = '<Chapter id="1"><p>Text<note id="23">[23]</note></p></Chapter>';
    const html = convertXmlChapterToHtml(xml);
    expect(html).toContain('<a data-note="23">[23]</a>');
  });

  it("preserves standard HTML elements", () => {
    const xml = `
      <Chapter id="1">
        <h4>Title</h4>
        <blockquote>A quote</blockquote>
        <p>Normal <em>emphasized</em> and <strong>bold</strong> text</p>
      </Chapter>
    `;
    const html = convertXmlChapterToHtml(xml);
    expect(html).toContain("<h4>Title</h4>");
    expect(html).toContain("<blockquote>A quote</blockquote>");
    expect(html).toContain("<em>emphasized</em>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("handles multiple speakers in one paragraph", () => {
    const xml = '<Chapter id="1"><p><Bob talking="true"/><Alice talking="true"/>Hello!</p></Chapter>';
    const html = convertXmlChapterToHtml(xml);
    expect(html).toContain('data-speaker="bob alice"');
  });

  it("handles complex Lalka-style XML", () => {
    const xml = `
      <Chapter id="2">
        <h4>II. Rządy starego subiekta</h4>
        <p><Ignacy-Rzecki>Pan Ignacy</Ignacy-Rzecki> od dwudziestu pięciu lat mieszkał w pokoiku.</p>
        <p><Ignacy-Rzecki talking="true"/>— Dzień dobry — rzekł <Ignacy-Rzecki>pan Ignacy</Ignacy-Rzecki>.</p>
        <p>Tekst z <note id="23">[23]</note> przypisem.</p>
      </Chapter>
    `;
    const html = convertXmlChapterToHtml(xml);

    expect(html).toContain('<section data-chapter="2">');
    expect(html).toContain("<h4>II. Rządy starego subiekta</h4>");
    expect(html).toContain('<span data-c="ignacy-rzecki">Pan Ignacy</span>');
    expect(html).toContain('data-speaker="ignacy-rzecki"');
    expect(html).toContain('<a data-note="23">[23]</a>');
  });

  it("throws on invalid XML", () => {
    const invalidXml = "<Chapter><p>unclosed";
    expect(() => convertXmlChapterToHtml(invalidXml)).toThrow();
  });

  it("throws when no Chapter element found", () => {
    const xml = "<Root><p>Hello</p></Root>";
    expect(() => convertXmlChapterToHtml(xml)).toThrow("No Chapter element found");
  });
});

describe("convertCompiledHtmlToSource", () => {
  it("removes data-index attributes", () => {
    const compiled = `
      <section data-chapter="1">
        <p data-index="0">Hello</p>
        <p data-index="1">World</p>
      </section>
    `;
    const source = convertCompiledHtmlToSource(compiled);
    expect(source).not.toContain("data-index");
  });

  it("converts character-placeholder to data-speaker on parent", () => {
    const compiled = `
      <section data-chapter="1">
        <p data-index="0">
          <span class="character-placeholder character-talking" data-character="bob" data-is-talking="true"></span>
          Hello world
        </p>
      </section>
    `;
    const source = convertCompiledHtmlToSource(compiled);
    expect(source).toContain('data-speaker="bob"');
    expect(source).not.toContain("character-placeholder");
  });

  it("converts character-highlighted to data-c", () => {
    const compiled = `
      <section data-chapter="1">
        <p>Hello <span class="character-highlighted" data-character="alice">Alice</span></p>
      </section>
    `;
    const source = convertCompiledHtmlToSource(compiled);
    expect(source).toContain('<span data-c="alice">Alice</span>');
    expect(source).not.toContain("character-highlighted");
    expect(source).not.toContain('data-character="alice"');
  });

  it("removes text-nowrap wrappers", () => {
    const compiled = `
      <section data-chapter="1">
        <p>Hello <span class="text-nowrap"><span class="character-highlighted" data-character="bob">Bob</span>.</span></p>
      </section>
    `;
    const source = convertCompiledHtmlToSource(compiled);
    expect(source).not.toContain("text-nowrap");
    expect(source).toContain('<span data-c="bob">Bob</span>.');
  });

  it("removes has-speaker class", () => {
    const compiled = `
      <section data-chapter="1">
        <p class="has-speaker" data-speaker="bob">Hello</p>
      </section>
    `;
    const source = convertCompiledHtmlToSource(compiled);
    expect(source).not.toContain("has-speaker");
    expect(source).toContain('data-speaker="bob"');
  });

  it("handles complex compiled HTML", () => {
    const compiled = `
      <section data-chapter="2">
        <h4 data-index="0">Title</h4>
        <p data-index="1" class="has-speaker">
          <span class="character-placeholder character-talking start-of-paragraph" data-character="ignacy" data-is-talking="true"></span>
          Hello <span class="text-nowrap"><span class="character-highlighted" data-character="klejn">Klejn</span>!</span>
        </p>
      </section>
    `;
    const source = convertCompiledHtmlToSource(compiled);

    expect(source).toContain('<section data-chapter="2">');
    expect(source).not.toContain("data-index");
    expect(source).not.toContain("character-placeholder");
    expect(source).not.toContain("text-nowrap");
    expect(source).toContain('data-speaker="ignacy"');
    expect(source).toContain('<span data-c="klejn">Klejn</span>!');
  });
});

describe("extractChapterMetadata", () => {
  it("extracts chapter number", () => {
    const html = '<section data-chapter="5"><p>Hello</p></section>';
    const meta = extractChapterMetadata(html);
    expect(meta.chapterNumber).toBe(5);
  });

  it("extracts title from h4", () => {
    const html = '<section data-chapter="1"><h4>Chapter Title</h4><p>Content</p></section>';
    const meta = extractChapterMetadata(html);
    expect(meta.title).toBe("Chapter Title");
  });

  it("extracts title from h3", () => {
    const html = '<section data-chapter="1"><h3>Act I</h3><p>Content</p></section>';
    const meta = extractChapterMetadata(html);
    expect(meta.title).toBe("Act I");
  });

  it("returns null title when no heading", () => {
    const html = '<section data-chapter="1"><p>Content only</p></section>';
    const meta = extractChapterMetadata(html);
    expect(meta.title).toBeNull();
  });

  it("counts paragraphs correctly", () => {
    const html = `
      <section data-chapter="1">
        <h4>Title</h4>
        <p>Para 1</p>
        <p>Para 2</p>
        <blockquote>Quote</blockquote>
      </section>
    `;
    const meta = extractChapterMetadata(html);
    expect(meta.paragraphCount).toBe(4);
  });
});
