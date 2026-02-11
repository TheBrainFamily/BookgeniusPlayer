import { describe, it, expect } from "vitest";
import { getParagraphsFromChapterWithText } from "./getParagraphsFromChapterWithText";

describe("getParagraphsFromChapterWithText", () => {
  it("preserves curly double quotes inside image attribute values", () => {
    const bookText = `
      <section data-chapter="1">
        <figure>
          <figcaption>
            Visible text
            <img alt="A note with \u201cll\u201d and \u201cand\u201d visible." src="/figures/note.svg" />
          </figcaption>
        </figure>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);
    const html = paragraphs[0]?.text ?? "";

    expect(html).toContain("\u201cll\u201d");
    expect(html).toContain("\u201cand\u201d");
    expect(html).not.toContain('"ll"');
  });

  it("preserves curly double quotes in text content", () => {
    const bookText = `
      <section data-chapter="1">
        <p>He said \u201chello\u201d and left.</p>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);
    const html = paragraphs[0]?.text ?? "";

    expect(html).toContain("\u201chello\u201d");
  });

  it("preserves curly apostrophes in text content", () => {
    const bookText = `
      <section data-chapter="1">
        <p>The Empress Catherine the Great\u2019s time.</p>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);
    const html = paragraphs[0]?.text ?? "";

    expect(html).toContain("Great\u2019s");
    expect(html).not.toContain("Great's");
  });

  it("preserves en dashes in text content", () => {
    const bookText = `
      <section data-chapter="1">
        <p>Years 1805\u20131812 are covered here.</p>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);
    const html = paragraphs[0]?.text ?? "";

    expect(html).toContain("1805\u20131812");
    expect(html).not.toContain("1805-1812");
  });

  it("indexes nested leaf paragraphs in reading order for blockquote structures", () => {
    const bookText = `
      <section data-chapter="5">
        <blockquote epub:type="z3998:diary">
          <header>
            <p>Lucy Westenra\u2019s Diary.</p>
          </header>
          <blockquote epub:type="z3998:diary-entry">
            <p><i>12 September.</i>\u2060\u2014How good they all are to me. ...</p>
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
    expect(paragraphs[0]?.text).toContain("Lucy Westenra\u2019s Diary.");
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

  it("uses placeholder text for void elements in non-pure mode", () => {
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
    expect(paragraphs[0]?.text).toBe("[Image: Portrait]");
    expect(paragraphs[0]?.attributes).toMatchObject({
      alt: "Portrait",
      src: "/figures/portrait.svg",
    });
  });
});

describe("getParagraphsFromChapterWithText — container extraction", () => {
  it("extracts container ancestry for Frankenstein-style letter structure", () => {
    const bookText = `
      <section data-chapter="3">
        <h2>Letter III</h2>
        <blockquote epub:type="z3998:letter">
          <header>
            <p>To Mrs. Saville, England.</p>
          </header>
          <p>My dear Sister,</p>
          <footer>
            <p>Your affectionate brother, R. Walton</p>
          </footer>
        </blockquote>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(3, bookText);

    expect(paragraphs).toHaveLength(4);

    // h2 has no containers (top-level)
    expect(paragraphs[0].elementType).toBe("h2");
    expect(paragraphs[0].containers).toBeUndefined();

    // header > p gets [blockquote, header]
    expect(paragraphs[1].elementType).toBe("p");
    expect(paragraphs[1].text).toContain("Mrs. Saville");
    expect(paragraphs[1].containers).toHaveLength(2);
    expect(paragraphs[1].containers![0].tagName).toBe("blockquote");
    expect(paragraphs[1].containers![0].attributes).toMatchObject({ "epub:type": "z3998:letter" });
    expect(paragraphs[1].containers![1].tagName).toBe("header");

    // body p gets [blockquote]
    expect(paragraphs[2].elementType).toBe("p");
    expect(paragraphs[2].text).toContain("dear Sister");
    expect(paragraphs[2].containers).toHaveLength(1);
    expect(paragraphs[2].containers![0].tagName).toBe("blockquote");

    // footer > p gets [blockquote, footer]
    expect(paragraphs[3].elementType).toBe("p");
    expect(paragraphs[3].text).toContain("R. Walton");
    expect(paragraphs[3].containers).toHaveLength(2);
    expect(paragraphs[3].containers![0].tagName).toBe("blockquote");
    expect(paragraphs[3].containers![1].tagName).toBe("footer");
  });

  it("top-level paragraphs have undefined containers", () => {
    const bookText = `
      <section data-chapter="1">
        <p>Just a paragraph.</p>
        <p>Another paragraph.</p>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].containers).toBeUndefined();
    expect(paragraphs[1].containers).toBeUndefined();
  });

  it("assigns stable container IDs: same blockquote gets the same ID across its children", () => {
    const bookText = `
      <section data-chapter="1">
        <blockquote>
          <p>First child.</p>
          <p>Second child.</p>
          <p>Third child.</p>
        </blockquote>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);

    expect(paragraphs).toHaveLength(3);
    // All three should share the same blockquote container ID
    const id0 = paragraphs[0].containers![0].id;
    const id1 = paragraphs[1].containers![0].id;
    const id2 = paragraphs[2].containers![0].id;
    expect(id0).toBe(id1);
    expect(id1).toBe(id2);
  });

  it("assigns different IDs to different blockquotes", () => {
    const bookText = `
      <section data-chapter="1">
        <blockquote>
          <p>From first blockquote.</p>
        </blockquote>
        <blockquote>
          <p>From second blockquote.</p>
        </blockquote>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].containers![0].id).not.toBe(paragraphs[1].containers![0].id);
  });

  it("handles deeply nested containers (blockquote > blockquote > p)", () => {
    const bookText = `
      <section data-chapter="1">
        <blockquote epub:type="z3998:diary">
          <blockquote epub:type="z3998:diary-entry">
            <p>12 September. How good they all are.</p>
          </blockquote>
        </blockquote>
      </section>
    `;

    const paragraphs = getParagraphsFromChapterWithText(1, bookText);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].containers).toHaveLength(2);
    expect(paragraphs[0].containers![0].tagName).toBe("blockquote");
    expect(paragraphs[0].containers![0].attributes["epub:type"]).toBe("z3998:diary");
    expect(paragraphs[0].containers![1].tagName).toBe("blockquote");
    expect(paragraphs[0].containers![1].attributes["epub:type"]).toBe("z3998:diary-entry");
  });
});
