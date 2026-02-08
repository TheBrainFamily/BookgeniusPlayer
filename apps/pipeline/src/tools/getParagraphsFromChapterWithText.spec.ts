import { describe, it, expect } from "vitest";
import { getParagraphsFromChapterWithText } from "./getParagraphsFromChapterWithText";

describe("getParagraphsFromChapterWithText", () => {
  it("preserves curly double quotes inside attribute values", () => {
    const bookText = `
      <section data-chapter="1">
        <figure>
          <img alt="A note with “ll” and “and” visible." src="/figures/note.svg" />
        </figure>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);
    const html = paragraphs[0]?.text ?? "";

    expect(html).toContain("“ll”");
    expect(html).toContain("“and”");
    expect(html).not.toContain('"ll"');
  });

  it("preserves curly double quotes in text content", () => {
    const bookText = `
      <section data-chapter="1">
        <p>He said “hello” and left.</p>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);
    const html = paragraphs[0]?.text ?? "";

    expect(html).toContain("“hello”");
  });

  it("preserves curly apostrophes in text content", () => {
    const bookText = `
      <section data-chapter="1">
        <p>The Empress Catherine the Great’s time.</p>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);
    const html = paragraphs[0]?.text ?? "";

    expect(html).toContain("Great’s");
    expect(html).not.toContain("Great's");
  });

  it("preserves en dashes in text content", () => {
    const bookText = `
      <section data-chapter="1">
        <p>Years 1805–1812 are covered here.</p>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);
    const html = paragraphs[0]?.text ?? "";

    expect(html).toContain("1805–1812");
    expect(html).not.toContain("1805-1812");
  });

  it("flattens nested blockquote content into a single top-level paragraph in pureText mode", () => {
    const bookText = `
      <section data-chapter="5">
        <blockquote epub:type="z3998:diary">
          <header>
            <p>Lucy Westenra’s Diary.</p>
          </header>
          <blockquote epub:type="z3998:diary-entry">
            <p><i>12 September.</i>⁠—How good they all are to me. ...</p>
            <p>Other text</p>
          </blockquote>
        </blockquote>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(5, bookText, true, true);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.dataIndex).toBe(0);
    expect(paragraphs[0]?.elementType).toBe("blockquote");
    expect(paragraphs[0]?.text).toContain("Lucy Westenra’s Diary.");
    expect(paragraphs[0]?.text).toContain("12 September.");
    expect(paragraphs[0]?.text).toContain("How good they all are to me.");
    expect(paragraphs[0]?.text).toContain("Other text");
  });
});
