import { describe, it, expect } from "vitest";
import { ensureDomParser } from "../../lib/domParser";
import { getChapterTitle } from "./get-chapter-title";

ensureDomParser();

function parseXml(xml: string): Element {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  return doc.documentElement;
}

describe("getChapterTitle", () => {
  it("should return the chapter title", () => {
    const chapter = `<chapter number="1"><Title>Chapter 1</Title><content>Content 1</content></chapter>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Chapter 1");
  });

  it("should handle hgroup with label, ordinal, and title", () => {
    const chapter = `<section data-chapter="1" data-epub-type="chapter">
      <hgroup>
        <h2>
          <span data-epub-type="label">Book</span>
          <span data-epub-type="ordinal z3998:roman">II</span>
        </h2>
        <p data-epub-type="title">The Castle</p>
      </hgroup>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Book II: The Castle");
  });

  it("should handle hgroup with ordinal and title", () => {
    const chapter = `<section data-chapter="2" data-epub-type="chapter">
      <hgroup>
        <h2 data-epub-type="ordinal z3998:roman">I</h2>
        <p data-epub-type="title">I Go to Styles</p>
      </hgroup>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("I: I Go to Styles");
  });

  it("should use data-epub-type as title when no hgroup with title exists", () => {
    const chapter = `<section data-chapter="1" data-epub-type="dedication">
      <p>To my Mother</p>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Dedication");
  });

  it("should handle hgroup with title but no h2", () => {
    const chapter = `<section data-chapter="1" data-epub-type="chapter">
      <hgroup>
        <p data-epub-type="title">Prologue</p>
      </hgroup>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Prologue");
  });

  it("should handle hgroup with title and h2 but no ordinal", () => {
    const chapter = `<section data-chapter="1" data-epub-type="chapter">
      <hgroup>
        <h2>Introduction</h2>
        <p data-epub-type="title">The Beginning</p>
      </hgroup>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("The Beginning");
  });

  it("should handle bare h2 with label and ordinal spans (no hgroup)", () => {
    const chapter = `<section data-chapter="5" data-epub-type="chapter">
      <h2>
        <span data-epub-type="label">Letter</span>
        <span data-epub-type="ordinal z3998:roman">I</span>
      </h2>
      <p>Some content here...</p>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Letter I");
  });

  it("should handle bare h2 with Chapter label and ordinal (no hgroup)", () => {
    const chapter = `<section data-chapter="9" data-epub-type="chapter">
      <h2>
        <span data-epub-type="label">Chapter</span>
        <span data-epub-type="ordinal z3998:roman">I</span>
      </h2>
      <p>I am by birth a Genevese...</p>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Chapter I");
  });

  it("should handle hgroup with label+ordinal but NO title paragraph", () => {
    const chapter = `<section data-chapter="1" data-epub-type="chapter">
      <hgroup>
        <h2>
          <span data-epub-type="label">Letter</span>
          <span data-epub-type="ordinal z3998:roman">I</span>
        </h2>
      </hgroup>
      <p>Content here</p>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Letter I");
  });

  it("should handle bare h2 with ordinal on h2 itself (no spans, no label)", () => {
    const chapter = `<section data-chapter="1" data-epub-type="chapter">
      <h2 data-epub-type="ordinal z3998:roman">I</h2>
      <p>Content here...</p>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Chapter I");
  });

  it("should handle h2 ordinal when root is html (text/html parsing)", () => {
    const html = `<html><body><section data-chapter="1" data-epub-type="chapter"><h2 data-epub-type="ordinal z3998:roman">I</h2><p>Content</p></section></body></html>`;
    const root = parseXml(html);

    expect(getChapterTitle(root)).toBe("Chapter I");
  });

  it("should find section epub-type when root is html (text/html parsing)", () => {
    const html = `<html><body><section data-chapter="1" data-epub-type="dedication"><p>To my Mother</p></section></body></html>`;
    const root = parseXml(html);

    expect(getChapterTitle(root)).toBe("Dedication");
  });

  // ── Multi-level heading support (h3/h4 for books with parts) ──────────

  it("should handle h3 with ordinal (books with parts, e.g. Age of Innocence)", () => {
    const chapter = `<section data-chapter="3" data-epub-type="chapter">
      <h3 data-epub-type="ordinal z3998:roman">III</h3>
      <p>It invariably happened in the same way.</p>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Chapter III");
  });

  it("should handle h4 with ordinal (books with books+parts, e.g. War and Peace)", () => {
    const chapter = `<section data-chapter="3" data-epub-type="chapter">
      <h4 data-epub-type="ordinal z3998:roman">II</h4>
      <p>Anna Pavlovna's drawing room was gradually filling.</p>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Chapter II");
  });

  it("should handle h3 with title (e.g. Siddhartha chapter titles)", () => {
    const chapter = `<section data-chapter="2" data-epub-type="chapter">
      <h3 data-epub-type="title">The Son of the Brahmin</h3>
      <p>In the shade of the house...</p>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("The Son of the Brahmin");
  });

  it("should handle h3 with label+ordinal spans (parts with chapters)", () => {
    const chapter = `<section data-chapter="5" data-epub-type="chapter">
      <h3>
        <span data-epub-type="label">Chapter</span>
        <span data-epub-type="ordinal z3998:roman">IV</span>
      </h3>
      <p>Content...</p>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Chapter IV");
  });

  // ── z3998: prefix stripping ─────────────────────────────────────────

  it("should strip z3998: prefix from section epub-type (e.g. frontispiece)", () => {
    const chapter = `<section data-chapter="2" data-epub-type="z3998:frontispiece">
      <figure><img alt="illustration" src="fig.svg"/></figure>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Frontispiece");
  });

  it("should strip z3998: compound epub-type (e.g. Dracula diary chapters)", () => {
    const chapter = `<section data-chapter="3" data-epub-type="chapter z3998:diary">
      <header>
        <h2 data-epub-type="ordinal z3998:roman">I</h2>
      </header>
    </section>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Chapter I");
  });

  it("should handle legacy chapter with act (h3) element", () => {
    const chapter = `<chapter number="1">
      <h3>Act I</h3>
      <Title>The Opening</Title>
    </chapter>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Act I, The Opening");
  });

  it("should handle legacy chapter with title and subtitle", () => {
    const chapter = `<chapter number="1">
      <Title>Chapter One.</Title>
      <Subtitle>In which our hero begins</Subtitle>
    </chapter>`;
    const root = parseXml(chapter);

    expect(getChapterTitle(root)).toBe("Chapter One, In which our hero begins");
  });
});
