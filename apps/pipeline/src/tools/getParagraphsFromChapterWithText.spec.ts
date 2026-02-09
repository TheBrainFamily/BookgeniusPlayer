import { describe, it, expect } from "vitest";
import { getParagraphsFromChapterWithText } from "./getParagraphsFromChapterWithText";

describe("getParagraphsFromChapterWithText", () => {
  it("preserves curly double quotes inside image attribute values", () => {
    const bookText = `
      <section data-chapter="1">
        <figure>
          <figcaption>
            Visible text
            <img alt="A note with “ll” and “and” visible." src="/figures/note.svg" />
          </figcaption>
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

  it("indexes nested leaf paragraphs in reading order for blockquote structures", () => {
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

    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]?.dataIndex).toBe(0);
    expect(paragraphs[1]?.dataIndex).toBe(1);
    expect(paragraphs[2]?.dataIndex).toBe(2);
    expect(paragraphs[0]?.elementType).toBe("p");
    expect(paragraphs[1]?.elementType).toBe("p");
    expect(paragraphs[2]?.elementType).toBe("p");
    expect(paragraphs[0]?.text).toContain("Lucy Westenra’s Diary.");
    expect(paragraphs[1]?.text).toContain("12 September.");
    expect(paragraphs[1]?.text).toContain("How good they all are to me.");
    expect(paragraphs[2]?.text).toContain("Other text");
  });

  it("keeps image-only figure as indexable leaf with meaningful pureText placeholder", () => {
    const bookText = `
      <section data-chapter="2">
        <figure>
          <img alt="Map of the estate" src="/figures/map.svg" />
        </figure>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(2, bookText, true, true);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.dataIndex).toBe(0);
    expect(paragraphs[0]?.elementType).toBe("img");
    expect(paragraphs[0]?.text).toBe("[Image: Map of the estate]");
  });

  it("keeps image-only figure HTML in non-pure mode", () => {
    const bookText = `
      <section data-chapter="3">
        <figure>
          <img alt="Portrait" src="/figures/portrait.svg" />
        </figure>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(3, bookText, true, false);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.dataIndex).toBe(0);
    expect(paragraphs[0]?.elementType).toBe("img");
    expect(paragraphs[0]?.text).toContain('alt="Portrait"');
    expect(paragraphs[0]?.text).toContain('src="/figures/portrait.svg"');
  });
});
