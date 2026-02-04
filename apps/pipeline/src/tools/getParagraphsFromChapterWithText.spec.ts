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
});
