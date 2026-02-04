/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { countParagraphsFromChapterHtml } from "../htmlNormalizer";

describe("countParagraphsFromChapterHtml", () => {
  it("counts data-index in compiled HTML", () => {
    const html =
      '<section data-chapter="1"><p data-index="0">A</p><p data-index="1">B</p><p data-index="2">C</p></section>';
    expect(countParagraphsFromChapterHtml(html)).toBe(3);
  });

  it("counts normalized prose children", () => {
    const html = '<section data-chapter="1"><h2>Title</h2><p>One</p><p>Two</p></section>';
    expect(countParagraphsFromChapterHtml(html)).toBe(3);
  });

  it("accounts for play rows in poemProse render mode", () => {
    const html = `<section data-chapter="1">
      <p data-speaker="bob">Hello</p>
      <p data-speaker="bob">World</p>
    </section>`;
    expect(countParagraphsFromChapterHtml(html, { renderMode: "poemProse" })).toBe(4);
  });
});
