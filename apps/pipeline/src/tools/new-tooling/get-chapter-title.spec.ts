import { DOMParser, type Element as XMLElement } from "@xmldom/xmldom";
import { describe, it, expect } from "vitest";
import { getChapterTitle } from "./get-chapter-title";

describe("getChapterTitle", () => {
  it("should return the chapter title", () => {
    const chapter = `<chapter number="1"><Title>Chapter 1</Title><content>Content 1</content></chapter>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(chapter, "text/xml");
    const root = doc.documentElement as XMLElement;

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
    const parser = new DOMParser();
    const doc = parser.parseFromString(chapter, "text/xml");
    const root = doc.documentElement as XMLElement;

    expect(getChapterTitle(root)).toBe("Book II: The Castle");
  });

  it("should handle hgroup with ordinal and title", () => {
    const chapter = `<section data-chapter="2" data-epub-type="chapter">
      <hgroup>
        <h2 data-epub-type="ordinal z3998:roman">I</h2>
        <p data-epub-type="title">I Go to Styles</p>
      </hgroup>
    </section>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(chapter, "text/xml");
    const root = doc.documentElement as XMLElement;

    expect(getChapterTitle(root)).toBe("I: I Go to Styles");
  });

  it("should use data-epub-type as title when no hgroup with title exists", () => {
    const chapter = `<section data-chapter="1" data-epub-type="dedication">
      <p>To my Mother</p>
    </section>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(chapter, "text/xml");
    const root = doc.documentElement as XMLElement;

    expect(getChapterTitle(root)).toBe("Dedication");
  });

  it("should handle hgroup with title but no h2", () => {
    const chapter = `<section data-chapter="1" data-epub-type="chapter">
      <hgroup>
        <p data-epub-type="title">Prologue</p>
      </hgroup>
    </section>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(chapter, "text/xml");
    const root = doc.documentElement as XMLElement;

    expect(getChapterTitle(root)).toBe("Prologue");
  });

  it("should handle hgroup with title and h2 but no ordinal", () => {
    const chapter = `<section data-chapter="1" data-epub-type="chapter">
      <hgroup>
        <h2>Introduction</h2>
        <p data-epub-type="title">The Beginning</p>
      </hgroup>
    </section>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(chapter, "text/xml");
    const root = doc.documentElement as XMLElement;

    expect(getChapterTitle(root)).toBe("The Beginning");
  });

  it("should handle legacy chapter with act (h3) element", () => {
    const chapter = `<chapter number="1">
      <h3>Act I</h3>
      <Title>The Opening</Title>
    </chapter>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(chapter, "text/xml");
    const root = doc.documentElement as XMLElement;

    expect(getChapterTitle(root)).toBe("Act I, The Opening");
  });

  it("should handle legacy chapter with title and subtitle", () => {
    const chapter = `<chapter number="1">
      <Title>Chapter One.</Title>
      <Subtitle>In which our hero begins</Subtitle>
    </chapter>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(chapter, "text/xml");
    const root = doc.documentElement as XMLElement;

    expect(getChapterTitle(root)).toBe("Chapter One, In which our hero begins");
  });
});
