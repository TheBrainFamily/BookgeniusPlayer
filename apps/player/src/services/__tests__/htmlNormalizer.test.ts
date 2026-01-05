/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { compareStructure, injectAvatarShells, injectDataIndex, normalizeChapterHtml, normalizeChapterHtmlEnhanced, sanitizeHtml, stripCharacterMarkup } from "../htmlNormalizer";

const parseSection = (html: string): { doc: Document; section: Element } => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const section = doc.querySelector("section[data-chapter]");
  if (!section) throw new Error("Missing section[data-chapter] in test input");
  return { doc, section };
};

const applyDataIndex = (html: string): string => {
  const { section } = parseSection(html);
  injectDataIndex(section);
  return section.outerHTML;
};

const applyAvatarShells = (html: string): string => {
  const { doc, section } = parseSection(html);
  injectAvatarShells(section, doc);
  return section.outerHTML;
};

describe("stripCharacterMarkup", () => {
  it("removes data-c spans preserving text", () => {
    const input = '<p>Hello <span data-c="bob">Bob</span>!</p>';
    expect(stripCharacterMarkup(input)).toBe("<p>Hello Bob!</p>");
  });

  it("removes data-speaker attributes", () => {
    const input = '<p data-speaker="bob">Hello world</p>';
    expect(stripCharacterMarkup(input)).toBe("<p>Hello world</p>");
  });

  it("handles multiple characters", () => {
    const input = `<p data-speaker="bob">Hello <span data-c="alice">Alice</span>, said <span data-c="bob">Bob</span>.</p>`;
    expect(stripCharacterMarkup(input)).toBe("<p>Hello Alice, said Bob.</p>");
  });

  it("preserves other HTML structure", () => {
    const input = `<section data-chapter="1"><h4>Title</h4><p data-speaker="x">Text with <em>emphasis</em>.</p></section>`;
    const result = stripCharacterMarkup(input);
    expect(result).toContain("<section data-chapter=");
    expect(result).toContain("<h4>Title</h4>");
    expect(result).toContain("<em>emphasis</em>");
    expect(result).not.toContain("data-speaker");
  });
});

describe("compareStructure", () => {
  it("returns match=true when only character markup differs", () => {
    const original = "<p>Hello Alice, said Bob.</p>";
    const withChars = '<p data-speaker="bob">Hello <span data-c="alice">Alice</span>, said <span data-c="bob">Bob</span>.</p>';
    expect(compareStructure(original, withChars).match).toBe(true);
  });

  it("returns match=false when text content differs", () => {
    const original = "<p>Hello Alice!</p>";
    const withChars = '<p data-speaker="bob">Hello <span data-c="bob">Bob</span>!</p>';
    expect(compareStructure(original, withChars).match).toBe(false);
  });

  it("returns match=false when structure differs", () => {
    const original = "<p>Hello</p><p>World</p>";
    const withChars = "<p>Hello World</p>";
    expect(compareStructure(original, withChars).match).toBe(false);
  });

  it("handles complex nested structures", () => {
    const original = `
      <section data-chapter="1">
        <h4>Chapter One</h4>
        <p>Pan Ignacy od dwudziestu pięciu lat mieszkał w pokoiku przy sklepie.</p>
        <p>— Dzień dobry — rzekł pan Ignacy. — Jak się masz, Klejn?</p>
        <blockquote>Cytat z książki</blockquote>
      </section>
    `;
    const withChars = `
      <section data-chapter="1">
        <h4>Chapter One</h4>
        <p><span data-c="ignacy-rzecki">Pan Ignacy</span> od dwudziestu pięciu lat mieszkał w pokoiku przy sklepie.</p>
        <p data-speaker="ignacy-rzecki">— Dzień dobry — rzekł <span data-c="ignacy-rzecki">pan Ignacy</span>. — Jak się masz, <span data-c="klejn">Klejn</span>?</p>
        <blockquote>Cytat z książki</blockquote>
      </section>
    `;
    expect(compareStructure(original, withChars).match).toBe(true);
  });
});

// describe("extractCharacterRefs", () => {
//   it("extracts speaker from paragraph", () => {
//     const html = '<p data-speaker="bob">Hello</p>';
//     const refs = extractCharacterRefs(html);
//     expect(refs).toHaveLength(1);
//     expect(refs[0]).toEqual({ slug: "bob", type: "speaker" });
//   });

//   it("extracts multiple speakers", () => {
//     const html = '<p data-speaker="bob alice">Hello</p>';
//     const refs = extractCharacterRefs(html);
//     expect(refs).toHaveLength(2);
//     expect(refs[0]).toEqual({ slug: "bob", type: "speaker" });
//     expect(refs[1]).toEqual({ slug: "alice", type: "speaker" });
//   });

//   it("extracts character mentions", () => {
//     const html = '<p>Hello <span data-c="alice">Alice</span>!</p>';
//     const refs = extractCharacterRefs(html);
//     expect(refs).toHaveLength(1);
//     expect(refs[0]).toEqual({ slug: "alice", type: "mention", text: "Alice" });
//   });

//   it("extracts both speakers and mentions", () => {
//     const html = `
//       <p data-speaker="bob">Hello <span data-c="alice">Alice</span>!</p>
//       <p data-speaker="alice">Hi <span data-c="bob">Bob</span>!</p>
//     `;
//     const refs = extractCharacterRefs(html);
//     expect(refs).toHaveLength(4);
//     expect(refs.filter((r) => r.type === "speaker")).toHaveLength(2);
//     expect(refs.filter((r) => r.type === "mention")).toHaveLength(2);
//   });
// });

describe("injectDataIndex", () => {
  it("assigns sequential data-index to all direct children", () => {
    const input = `
      <section data-chapter="1">
        <h4>Title</h4>
        <p>Para 1</p>
        <p>Para 2</p>
        <blockquote>Quote</blockquote>
        <div>Div</div>
      </section>
    `;
    const result = applyDataIndex(input);
    expect(result).toContain('data-index="0"');
    expect(result).toContain('data-index="1"');
    expect(result).toContain('data-index="2"');
    expect(result).toContain('data-index="3"');
    expect(result).toContain('data-index="4"');
  });

  it("does not assign data-index to nested elements", () => {
    const input = `<section data-chapter="1"><p>Text with <em>nested</em> element</p></section>`;
    const result = applyDataIndex(input);
    expect(result).toMatch(/<p data-index="0">/);
    expect(result).not.toContain("<em data-index");
  });

  it("handles any element type", () => {
    const input = `
      <section data-chapter="1">
        <custom-element>Custom 1</custom-element>
        <another-tag>Custom 2</another-tag>
        <p>Regular paragraph</p>
      </section>
    `;
    const result = applyDataIndex(input);
    expect(result).toContain('data-index="0"');
    expect(result).toContain('data-index="1"');
    expect(result).toContain('data-index="2"');
  });
});

describe("injectAvatarShells", () => {
  it("injects avatar shell for speaker", () => {
    const input = '<section data-chapter="1"><p data-speaker="bob">Hello</p></section>';
    const result = applyAvatarShells(input);
    expect(result).toContain("character-placeholder");
    expect(result).toContain('data-character="bob"');
    expect(result).toContain('data-is-talking="true"');
  });

  it("adds has-speaker class", () => {
    const input = '<section data-chapter="1"><p data-speaker="bob">Hello</p></section>';
    const result = applyAvatarShells(input);
    expect(result).toContain("has-speaker");
  });

  it("adds character-highlighted to mentions", () => {
    const input = '<section data-chapter="1"><p>Hello <span data-c="bob">Bob</span></p></section>';
    const result = applyAvatarShells(input);
    expect(result).toContain("character-highlighted");
  });

  it("only highlights first occurrence of each character per paragraph", () => {
    const input = `
      <section data-chapter="1">
        <p>Hello <span data-c="bob">Bob</span>, said <span data-c="alice">Alice</span>. Then <span data-c="bob">Bob</span> replied.</p>
      </section>
    `;
    const result = applyAvatarShells(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    const bobSpans = doc.querySelectorAll('span[data-c="bob"]');
    expect(bobSpans.length).toBe(2);
    expect(bobSpans[0].classList.contains("character-highlighted")).toBe(true);
    expect(bobSpans[1].classList.contains("character-highlighted")).toBe(false);

    const aliceSpan = doc.querySelector('span[data-c="alice"]');
    expect(aliceSpan?.classList.contains("character-highlighted")).toBe(true);
  });

  it("resets character tracking for each paragraph", () => {
    const input = `
      <section data-chapter="1">
        <p>First <span data-c="bob">Bob</span> mention.</p>
        <p>Second <span data-c="bob">Bob</span> mention in new paragraph.</p>
      </section>
    `;
    const result = applyAvatarShells(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    const bobSpans = doc.querySelectorAll('span[data-c="bob"]');
    expect(bobSpans.length).toBe(2);
    expect(bobSpans[0].classList.contains("character-highlighted")).toBe(true);
    expect(bobSpans[1].classList.contains("character-highlighted")).toBe(true);
  });

  it("does not highlight character mention when character is the speaker", () => {
    const input = `
      <section data-chapter="1">
        <p data-speaker="piglet">'No,' said <span data-c="piglet">Piglet</span>, 'it's you who were out, <span data-c="winnie-the-pooh">Pooh</span>.'</p>
      </section>
    `;
    const result = applyAvatarShells(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    const pigletSpan = doc.querySelector('span[data-c="piglet"]');
    expect(pigletSpan?.classList.contains("character-highlighted")).toBe(false);
    expect(pigletSpan?.getAttribute("data-character")).toBe("piglet");

    const poohSpan = doc.querySelector('span[data-c="winnie-the-pooh"]');
    expect(poohSpan?.classList.contains("character-highlighted")).toBe(true);
  });

  it("does not highlight any speaker when multiple speakers on paragraph", () => {
    const input = `
      <section data-chapter="1">
        <p data-speaker="alice bob">'Hello,' said <span data-c="alice">Alice</span> and <span data-c="bob">Bob</span> to <span data-c="charlie">Charlie</span>.</p>
      </section>
    `;
    const result = applyAvatarShells(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    const aliceSpan = doc.querySelector('span[data-c="alice"]');
    expect(aliceSpan?.classList.contains("character-highlighted")).toBe(false);

    const bobSpan = doc.querySelector('span[data-c="bob"]');
    expect(bobSpan?.classList.contains("character-highlighted")).toBe(false);

    const charlieSpan = doc.querySelector('span[data-c="charlie"]');
    expect(charlieSpan?.classList.contains("character-highlighted")).toBe(true);
  });

  it("uses first speaker for avatar when multiple", () => {
    const input = '<section data-chapter="1"><p data-speaker="bob alice">Hello</p></section>';
    const result = applyAvatarShells(input);
    expect(result).toContain('data-character="bob"');
  });

  it("does NOT inject avatar shells into drama table rows but adds has-speaker class", () => {
    const input = `
      <section data-chapter="1">
        <p>Some prose before the drama.</p>
        <table data-drama="">
          <tbody>
            <tr data-speaker="heffalump">
              <td data-persona="">Heffalump</td>
              <td>"Ho-ho!"</td>
            </tr>
            <tr data-speaker="piglet">
              <td data-persona="">Piglet</td>
              <td>"Tra-la-la."</td>
            </tr>
          </tbody>
        </table>
        <p>Some prose after.</p>
      </section>
    `;
    const result = applyAvatarShells(input);
    expect(result).toContain("data-drama");
    expect(result).toContain('data-speaker="heffalump"');
    expect(result).toContain('data-speaker="piglet"');
    expect(result).toContain('<tr data-speaker="heffalump" class="has-speaker">');
    expect(result).toContain('<tr data-speaker="piglet" class="has-speaker">');
    const placeholderCount = (result.match(/character-placeholder/g) || []).length;
    expect(placeholderCount).toBe(0);
  });

  it("injects avatar shells into prose paragraphs but not drama tables in mixed content", () => {
    const input = `
      <section data-chapter="1">
        <p data-speaker="pooh">"Hello," said Pooh.</p>
        <table data-drama="">
          <tbody>
            <tr data-speaker="heffalump">
              <td data-persona="">Heffalump</td>
              <td>"Ho-ho!"</td>
            </tr>
          </tbody>
        </table>
        <p data-speaker="piglet">"Goodbye," said Piglet.</p>
      </section>
    `;
    const result = applyAvatarShells(input);
    const placeholderMatches = result.match(/character-placeholder/g) || [];
    expect(placeholderMatches.length).toBe(2);
    expect(result).toContain('<p data-speaker="pooh" class="has-speaker"><span class="character-placeholder');
    expect(result).toContain('<p data-speaker="piglet" class="has-speaker"><span class="character-placeholder');
    expect(result).toContain('<tr data-speaker="heffalump" class="has-speaker">');
    expect(result).not.toContain('<tr data-speaker="heffalump" class="has-speaker"><span');
  });
});

describe("normalizeChapterHtml (baseline)", () => {
  it("preserves drama tables and does not wrap prose into play rows", () => {
    const input = `
      <section data-chapter="1">
        <p data-speaker="pooh">"Hello," said Pooh.</p>
        <table data-drama="">
          <tbody>
            <tr data-speaker="heffalump">
              <td data-persona="">Heffalump</td>
              <td>"Ho-ho!"</td>
            </tr>
          </tbody>
        </table>
        <p>After the drama.</p>
      </section>
    `;
    const result = normalizeChapterHtml(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const section = doc.querySelector("section[data-chapter]");

    expect(section?.querySelector("table[data-drama]")).toBeTruthy();
    expect(section?.querySelector("tr[data-speaker='heffalump']")).toBeTruthy();
    expect(section?.querySelectorAll(".play-row").length).toBe(0);
    expect(section?.querySelectorAll(".character-placeholder").length).toBe(1);
  });
});

describe("normalizeChapterHtmlEnhanced", () => {
  it("renders speaker paragraphs as play rows with labels", () => {
    const input = `
      <section data-chapter="1">
        <p data-speaker="pooh">"Hello," said Pooh.</p>
        <p>After the drama.</p>
      </section>
    `;
    const result = normalizeChapterHtmlEnhanced(input, { speakerDisplayNames: new Map([["pooh", "Pooh"]]) });
    const { section } = parseSection(result);

    const playRow = section.querySelector(".play-row");
    expect(playRow).toBeTruthy();

    const label = playRow?.querySelector(".character-text p[data-is-character='true'] strong");
    expect(label?.textContent).toBe("Pooh");

    const content = playRow?.querySelector(".character-text p[data-is-character='false']");
    expect(content?.textContent).toContain("Hello");

    const placeholder = playRow?.querySelector(".character-avatar .character-placeholder");
    expect(placeholder?.getAttribute("data-character")).toBe("pooh");

    const narration = Array.from(section.querySelectorAll("p")).find((p) => p.textContent?.includes("After"));
    expect(narration?.getAttribute("data-index")).toBeTruthy();
    expect(section.getAttribute("data-chapter-format")).toBe("mixed");
  });

  it("wraps pure em paragraphs as didaskalia rows", () => {
    const input = `
      <section data-chapter="1">
        <p><em>Enter Pooh.</em></p>
      </section>
    `;
    const result = normalizeChapterHtmlEnhanced(input);
    const { section } = parseSection(result);

    const didaskaliaRow = section.querySelector(".play-row.didaskalia-row");
    expect(didaskaliaRow).toBeTruthy();

    const didaskaliaP = didaskaliaRow?.querySelector("p[data-is-didaskalia='true']");
    expect(didaskaliaP?.textContent).toContain("Enter Pooh");
  });

  it("keeps drama tables and adds play rows for speakers", () => {
    const input = `
      <section data-chapter="1">
        <p data-speaker="pooh">"Hello," said Pooh.</p>
        <table data-drama="">
          <tbody>
            <tr data-speaker="heffalump">
              <td data-persona="">Heffalump</td>
              <td>"Ho-ho!"</td>
            </tr>
          </tbody>
        </table>
      </section>
    `;
    const result = normalizeChapterHtmlEnhanced(input);
    const { section } = parseSection(result);

    expect(section.querySelector("table[data-drama]")).toBeTruthy();
    expect(section.querySelector("tr[data-speaker='heffalump']")).toBeTruthy();
    expect(section.querySelectorAll(".play-row").length).toBe(1);
  });

  describe("consecutive speaker grouping", () => {
    it("groups consecutive paragraphs from the same speaker into single play-row", () => {
      const input = `
        <section data-chapter="1">
          <p data-speaker="winnie-the-pooh">'Yes, but suppose Rabbit is out?'</p>
          <p data-speaker="winnie-the-pooh">'Or suppose I get stuck...'</p>
          <p data-speaker="winnie-the-pooh">'Because I know...'</p>
        </section>
      `;
      const result = normalizeChapterHtmlEnhanced(input);
      const { section } = parseSection(result);

      // Should have only ONE play-row
      const playRows = section.querySelectorAll(".play-row");
      expect(playRows.length).toBe(1);

      // Should have only ONE speaker label
      const labels = section.querySelectorAll(".character-text p[data-is-character='true'] strong");
      expect(labels.length).toBe(1);

      // Should have all three content paragraphs inside character-text
      const contentPs = section.querySelectorAll(".character-text p[data-is-character='false']");
      expect(contentPs.length).toBe(3);

      // Verify content is preserved
      expect(result).toContain("Rabbit is out");
      expect(result).toContain("get stuck");
      expect(result).toContain("Because I know");
    });

    it("creates separate play-rows when speaker changes", () => {
      const input = `
        <section data-chapter="1">
          <p data-speaker="winnie-the-pooh">'Hello Piglet!'</p>
          <p data-speaker="piglet">'Hello Pooh!'</p>
          <p data-speaker="winnie-the-pooh">'How are you?'</p>
        </section>
      `;
      const result = normalizeChapterHtmlEnhanced(input);
      const { section } = parseSection(result);

      // Should have THREE play-rows (speaker changes each time)
      const playRows = section.querySelectorAll(".play-row");
      expect(playRows.length).toBe(3);

      // Each should have its own speaker label
      const labels = section.querySelectorAll(".character-text p[data-is-character='true'] strong");
      expect(labels.length).toBe(3);
    });

    it("groups multiple consecutive then handles speaker change", () => {
      const input = `
        <section data-chapter="1">
          <p data-speaker="pooh">'Line 1'</p>
          <p data-speaker="pooh">'Line 2'</p>
          <p data-speaker="piglet">'Response'</p>
        </section>
      `;
      const result = normalizeChapterHtmlEnhanced(input);
      const { section } = parseSection(result);

      // Should have TWO play-rows (2 pooh grouped, 1 piglet)
      const playRows = section.querySelectorAll(".play-row");
      expect(playRows.length).toBe(2);

      // First play-row should have 2 content paragraphs
      const firstPlayRow = playRows[0];
      const firstContentPs = firstPlayRow.querySelectorAll(".character-text p[data-is-character='false']");
      expect(firstContentPs.length).toBe(2);

      // Second play-row should have 1 content paragraph
      const secondPlayRow = playRows[1];
      const secondContentPs = secondPlayRow.querySelectorAll(".character-text p[data-is-character='false']");
      expect(secondContentPs.length).toBe(1);
    });

    it("handles didaskalia between speaker groups correctly", () => {
      const input = `
        <section data-chapter="1">
          <p data-speaker="pooh">'Hello!'</p>
          <p data-speaker="pooh">'How are you?'</p>
          <p><em>Piglet enters.</em></p>
          <p data-speaker="piglet">'Hi there!'</p>
        </section>
      `;
      const result = normalizeChapterHtmlEnhanced(input);
      const { section } = parseSection(result);

      // Should have: 1 grouped pooh play-row, 1 didaskalia, 1 piglet play-row
      const playRows = section.querySelectorAll(".play-row:not(.didaskalia-row)");
      expect(playRows.length).toBe(2);

      const didaskaliaRows = section.querySelectorAll(".play-row.didaskalia-row");
      expect(didaskaliaRows.length).toBe(1);
    });

    it("handles narration between speaker groups correctly", () => {
      const input = `
        <section data-chapter="1">
          <p data-speaker="pooh">'Hello!'</p>
          <p>Pooh paused and looked around.</p>
          <p data-speaker="pooh">'Anyone there?'</p>
        </section>
      `;
      const result = normalizeChapterHtmlEnhanced(input);
      const { section } = parseSection(result);

      // Should have TWO play-rows (narration breaks the group)
      const playRows = section.querySelectorAll(".play-row");
      expect(playRows.length).toBe(2);

      // The narration paragraph should still exist
      expect(result).toContain("paused and looked around");
    });
  });
});

describe("sanitizeHtml", () => {
  it("removes script tags", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Hello</p>");
    expect(result).toContain("<p>World</p>");
  });

  it("removes onclick attributes", () => {
    const html = '<p onclick="alert(1)">Click me</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onclick");
    expect(result).toContain("<p>Click me</p>");
  });

  it("removes javascript: URLs", () => {
    const html = '<a href="javascript:alert(1)">Link</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("javascript:");
  });

  it("preserves safe content", () => {
    const html = `
      <section data-chapter="1">
        <h4>Title</h4>
        <p data-speaker="bob">Hello <em>world</em>!</p>
        <blockquote>A quote with <strong>bold</strong></blockquote>
      </section>
    `;
    const result = sanitizeHtml(html);
    expect(result).toContain("data-chapter=");
    expect(result).toContain("data-speaker=");
    expect(result).toContain("<em>world</em>");
    expect(result).toContain("<blockquote>");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("removes iframe tags", () => {
    const html = '<p>Text</p><iframe src="evil.com"></iframe>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>Text</p>");
  });
});
