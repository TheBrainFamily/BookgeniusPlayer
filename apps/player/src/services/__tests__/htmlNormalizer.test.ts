/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import {
  compareStructure,
  extractCharacterOccurrences,
  injectAvatarShells,
  injectDataIndex,
  normalizeChapterHtml,
  normalizeChapterHtmlEnhanced,
  preprocessInlineSpeakerSpans,
  sanitizeHtml,
  stripCharacterMarkup,
} from "../htmlNormalizer";

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

const applyInlineSpeakerSegmentation = (
  html: string,
  options: { withAvatars?: boolean } = {},
): string => {
  const { doc, section } = parseSection(html);
  injectDataIndex(section);
  preprocessInlineSpeakerSpans(section, doc);
  if (options.withAvatars ?? true) {
    injectAvatarShells(section, doc);
  }
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

  it("unwraps inline speaker wrappers preserving text", () => {
    const input = `
      <p>
        <span class="inline-speaker-line inline-speaker-line--speaker" data-speaker="henry-clerval">
          Henry said: <span data-speaker="henry-clerval">"You are quite right"</span>
        </span>
      </p>
    `;
    expect(stripCharacterMarkup(input)).toBe('<p> Henry said: "You are quite right" </p>');
  });
});

describe("compareStructure", () => {
  it("returns match=true when only character markup differs", () => {
    const original = "<p>Hello Alice, said Bob.</p>";
    const withChars =
      '<p data-speaker="bob">Hello <span data-c="alice">Alice</span>, said <span data-c="bob">Bob</span>.</p>';
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
  it("assigns sequential data-index in reading order for mixed chapter leaves", () => {
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

  it("indexes diary header and diary-entry paragraph leaves instead of outer blockquote", () => {
    const input = `
      <section data-chapter="1">
        <blockquote data-epub-type="z3998:diary">
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
    const result = applyDataIndex(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    const outerDiary = doc.querySelector('blockquote[data-epub-type="z3998:diary"]');
    expect(outerDiary?.hasAttribute("data-index")).toBe(false);

    const paragraphs = doc.querySelectorAll("section[data-chapter] p");
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]?.getAttribute("data-index")).toBe("0");
    expect(paragraphs[1]?.getAttribute("data-index")).toBe("1");
    expect(paragraphs[2]?.getAttribute("data-index")).toBe("2");
  });

  it("assigns data-index to image-only figures via img leaf", () => {
    const input = `
      <section data-chapter="1">
        <figure>
          <img alt="Portrait" src="/figures/portrait.svg" />
        </figure>
      </section>
    `;
    const result = applyDataIndex(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    expect(doc.querySelector("img")?.getAttribute("data-index")).toBe("0");
    expect(doc.querySelector("figure")?.hasAttribute("data-index")).toBe(false);
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
    expect(result).toContain(
      '<p data-speaker="pooh" class="has-speaker"><span class="character-placeholder',
    );
    expect(result).toContain(
      '<p data-speaker="piglet" class="has-speaker"><span class="character-placeholder',
    );
    expect(result).toContain('<tr data-speaker="heffalump" class="has-speaker">');
    expect(result).not.toContain('<tr data-speaker="heffalump" class="has-speaker"><span');
  });

  it("injects one avatar at letter start when a speaker has >60% share", () => {
    const input = `
      <section data-chapter="1">
        <blockquote data-epub-type="z3998:letter">
          <header>
            <p data-speaker="robert-walton">To Mrs. Saville, England.</p>
          </header>
          <p data-speaker="robert-walton">Line 1</p>
          <p data-speaker="robert-walton">Line 2</p>
          <p data-speaker="robert-walton">Line 3</p>
          <p data-speaker="victor-frankenstein">Different speaker line.</p>
        </blockquote>
      </section>
    `;
    const result = applyAvatarShells(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    const letter = doc.querySelector('blockquote[data-epub-type~="z3998:letter"]');
    expect(letter).toBeTruthy();

    const placeholders = letter?.querySelectorAll(".character-placeholder") ?? [];
    expect(placeholders.length).toBe(1);

    const directPlaceholder = letter?.querySelector(":scope > .character-placeholder");
    expect(directPlaceholder).toBeTruthy();
    expect(directPlaceholder?.getAttribute("data-character")).toBe("robert-walton");

    const nestedPlaceholders = letter?.querySelectorAll("p .character-placeholder") ?? [];
    expect(nestedPlaceholders.length).toBe(0);
  });

  it("injects avatar for letter blockquote speaker even without nested speaker tags", () => {
    const input = `
      <section data-chapter="1">
        <blockquote data-epub-type="z3998:letter" data-speaker="robert-walton">
          <header>
            <p>To Mrs. Saville, England.</p>
          </header>
          <p>How slowly the time passes here...</p>
        </blockquote>
      </section>
    `;
    const result = applyAvatarShells(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    const letter = doc.querySelector('blockquote[data-epub-type~="z3998:letter"]');
    const directPlaceholder = letter?.querySelector(":scope > .character-placeholder");
    expect(directPlaceholder).toBeTruthy();
    expect(directPlaceholder?.getAttribute("data-character")).toBe("robert-walton");
  });

  it("skips letter avatar when there is no dominant speaker", () => {
    const input = `
      <section data-chapter="1">
        <blockquote data-epub-type="z3998:letter">
          <p data-speaker="robert-walton">Line 1</p>
          <p data-speaker="victor-frankenstein">Line 2</p>
          <p data-speaker="robert-walton">Line 3</p>
          <p data-speaker="victor-frankenstein">Line 4</p>
        </blockquote>
      </section>
    `;
    const result = applyAvatarShells(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const letter = doc.querySelector('blockquote[data-epub-type~="z3998:letter"]');

    const placeholders = letter?.querySelectorAll(".character-placeholder") ?? [];
    expect(placeholders.length).toBe(0);
  });

  it("uses mid-sentence-speaker class for nested speaker avatars", () => {
    const input = `
      <section data-chapter="1">
        <p data-speaker="elizabeth">"When I reflect," said she, "<span data-speaker="elizabeth">on the miserable death of Justine Moritz</span>"</p>
      </section>
    `;
    const result = applyAvatarShells(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    const placeholders = doc.querySelectorAll(".character-placeholder");
    expect(placeholders.length).toBe(2);

    // The paragraph-level avatar should have start-of-paragraph
    const paragraphShell = doc.querySelector("p > .character-placeholder.start-of-paragraph");
    expect(paragraphShell).toBeTruthy();

    // The nested span avatar should have mid-sentence-speaker (not start-of-paragraph)
    const nestedShell = doc.querySelector(
      "span[data-speaker] > .character-placeholder.mid-sentence-speaker",
    );
    expect(nestedShell).toBeTruthy();
    expect(nestedShell?.classList.contains("start-of-paragraph")).toBe(false);
  });

  it("uses start-of-paragraph class for non-nested speaker avatars", () => {
    const input = `
      <section data-chapter="1">
        <p data-speaker="bob">Hello world</p>
      </section>
    `;
    const result = applyAvatarShells(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    const shell = doc.querySelector(".character-placeholder");
    expect(shell?.classList.contains("start-of-paragraph")).toBe(true);
    expect(shell?.classList.contains("mid-sentence-speaker")).toBe(false);
  });

  it("treats 60% speaker share in letter as not dominant", () => {
    const input = `
      <section data-chapter="1">
        <blockquote data-epub-type="z3998:letter">
          <p data-speaker="robert-walton">Line 1</p>
          <p data-speaker="robert-walton">Line 2</p>
          <p data-speaker="robert-walton">Line 3</p>
          <p data-speaker="victor-frankenstein">Line 4</p>
          <p data-speaker="victor-frankenstein">Line 5</p>
        </blockquote>
      </section>
    `;
    const result = applyAvatarShells(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const letter = doc.querySelector('blockquote[data-epub-type~="z3998:letter"]');

    const placeholders = letter?.querySelectorAll(".character-placeholder") ?? [];
    expect(placeholders.length).toBe(0);
  });
});

describe("preprocessInlineSpeakerSpans", () => {
  it("splits deep inline speech into narration and speaker lines while keeping one paragraph index", () => {
    const input = `
      <section data-chapter="1">
        <p>
          The street was crowded and loud before he finally leaned closer and whispered
          <span data-speaker="henry-clerval">"You are quite right"</span> before stepping back.
        </p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const paragraph = doc.querySelector("p[data-index='0']");
    const lines = paragraph?.querySelectorAll(":scope > .inline-speaker-line") ?? [];

    expect(doc.querySelectorAll("[data-index]").length).toBe(1);
    expect(lines.length).toBe(2);
    expect(lines[0].classList.contains("inline-speaker-line--narration")).toBe(true);
    expect(lines[1].classList.contains("inline-speaker-line--speaker")).toBe(true);
    expect(lines[1].getAttribute("data-speaker")).toBe("henry-clerval");
    expect(lines[1].firstElementChild?.classList.contains("character-placeholder")).toBe(true);
    expect(lines[1].textContent).toContain("before stepping back.");
  });

  it("hoists first speaker line when first quote starts before threshold", () => {
    const input = `
      <section data-chapter="1">
        <p>Henry said: <span data-speaker="henry-clerval">"You are quite right"</span> and then left.</p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const lines = doc.querySelectorAll("p[data-index='0'] > .inline-speaker-line");

    expect(lines.length).toBe(1);
    expect(lines[0].getAttribute("data-speaker")).toBe("henry-clerval");
    expect(lines[0].textContent).toContain("Henry said:");
    expect(lines[0].textContent).toContain("You are quite right");
    expect(lines[0].textContent).toContain("and then left.");
    expect(lines[0].firstElementChild?.classList.contains("character-placeholder")).toBe(true);
  });

  it("uses visible offset with nested formatting before first speaker", () => {
    const input = `
      <section data-chapter="1">
        <p><em>This opening sentence with nested emphasis is intentionally very long.</em> Then narration continues <strong>before</strong> the quote <span data-speaker="henry-clerval">"You are quite right"</span> ends.</p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input, { withAvatars: false });
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const lines = doc.querySelectorAll("p[data-index='0'] > .inline-speaker-line");

    expect(lines.length).toBe(2);
    expect(lines[0].classList.contains("inline-speaker-line--narration")).toBe(true);
    expect(lines[1].getAttribute("data-speaker")).toBe("henry-clerval");
    expect(lines[1].textContent).toContain("ends.");
  });

  it("hoists when inline speaker starts at offset 0", () => {
    const input = `
      <section data-chapter="1">
        <p><span data-speaker="henry-clerval">"You are quite right"</span> and then left.</p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const lines = doc.querySelectorAll("p[data-index='0'] > .inline-speaker-line");

    expect(lines.length).toBe(1);
    expect(lines[0].getAttribute("data-speaker")).toBe("henry-clerval");
    expect(lines[0].textContent).toContain("and then left.");
    expect(lines[0].firstElementChild?.classList.contains("character-placeholder")).toBe(true);
  });

  it("is a no-op for block-level speaker paragraphs without inline speaker spans", () => {
    const input = `
      <section data-chapter="1">
        <p data-speaker="hero">"This is already block-level dialogue."</p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const paragraph = doc.querySelector("p[data-index='0']");

    expect(doc.querySelectorAll(".inline-speaker-line").length).toBe(0);
    expect(paragraph?.getAttribute("data-speaker")).toBe("hero");
    expect(paragraph?.querySelector(".character-placeholder")).toBeTruthy();
  });

  it("splits speaker switches in one paragraph while keeping a single data-index", () => {
    const input = `
      <section data-chapter="1">
        <p>I said: <span data-speaker="hero">thus, I came at length opposite..</span> and then my dear friend <span data-c="henry-clerval">Henry </span> said: <span data-speaker="henry-clerval">"You are quite right"</span> and that was that</p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const paragraph = doc.querySelector("p[data-index='0']");
    const lines = paragraph?.querySelectorAll(":scope > .inline-speaker-line") ?? [];

    expect(doc.querySelectorAll("[data-index]").length).toBe(1);
    expect(lines.length).toBe(3);
    expect(lines[0].getAttribute("data-speaker")).toBe("hero");
    expect(lines[1].classList.contains("inline-speaker-line--narration")).toBe(true);
    expect(lines[2].getAttribute("data-speaker")).toBe("henry-clerval");
    expect(lines[2].textContent).toContain("and that was that");
    expect(lines[0].firstElementChild?.classList.contains("character-placeholder")).toBe(true);
    expect(lines[2].firstElementChild?.classList.contains("character-placeholder")).toBe(true);
  });

  it("keeps paragraph speaker as line speaker around mid-paragraph switch", () => {
    const input = `
      <section data-chapter="1">
        <p data-speaker="hero">"I can start this." then <span data-speaker="henry-clerval">"And I can interrupt."</span> then I continue.</p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input, { withAvatars: false });
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const paragraph = doc.querySelector("p[data-index='0']");
    const lines = paragraph?.querySelectorAll(":scope > .inline-speaker-line--speaker") ?? [];

    expect(paragraph?.hasAttribute("data-speaker")).toBe(false);
    expect(Array.from(lines).map((line) => line.getAttribute("data-speaker"))).toEqual([
      "hero",
      "henry-clerval",
      "hero",
    ]);
  });

  it("handles all speaker switches in one paragraph", () => {
    const input = `
      <section data-chapter="1">
        <p>Lead in <span data-speaker="hero">"A"</span> then <span data-speaker="henry-clerval">"B"</span> then <span data-speaker="victor-frankenstein">"C"</span> end.</p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input, { withAvatars: false });
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const speakerLines = doc.querySelectorAll("p[data-index='0'] > .inline-speaker-line--speaker");

    expect(Array.from(speakerLines).map((line) => line.getAttribute("data-speaker"))).toEqual([
      "hero",
      "henry-clerval",
      "victor-frankenstein",
    ]);
  });

  it("absorbs short narration bridge when same speaker continues", () => {
    const input = `
      <section data-chapter="1">
        <p><span data-speaker="elizabeth">"When I reflect, my dear cousin,"</span> said she, <span data-speaker="elizabeth">"on the miserable death of Justine Moritz, I no longer see the world."</span></p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input, { withAvatars: false });
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const lines = doc.querySelectorAll("p[data-index='0'] > .inline-speaker-line");

    // "said she," is short narration between same speaker → absorbed into one speaker line
    expect(lines.length).toBe(1);
    expect(lines[0].getAttribute("data-speaker")).toBe("elizabeth");
    expect(lines[0].textContent).toContain("When I reflect");
    expect(lines[0].textContent).toContain("said she,");
    expect(lines[0].textContent).toContain("miserable death");
  });

  it("does not absorb narration bridge between different speakers", () => {
    const input = `
      <section data-chapter="1">
        <p><span data-speaker="hero">"Hello,"</span> he said, and then <span data-speaker="henry-clerval">"Goodbye,"</span> replied Henry.</p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input, { withAvatars: false });
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const speakerLines = doc.querySelectorAll("p[data-index='0'] > .inline-speaker-line--speaker");

    // Different speakers should remain separate
    expect(speakerLines.length).toBe(2);
    expect(speakerLines[0].getAttribute("data-speaker")).toBe("hero");
    expect(speakerLines[1].getAttribute("data-speaker")).toBe("henry-clerval");
  });

  it("does not segment verse and drama-table contexts", () => {
    const input = `
      <section data-chapter="1">
        <blockquote data-epub-type="z3998:verse">
          <p>Verse line with <span data-speaker="hero">"inline quote"</span>.</p>
        </blockquote>
        <table data-drama="">
          <tbody>
            <tr>
              <td><p>Drama cell <span data-speaker="hero">"line"</span>.</p></td>
            </tr>
          </tbody>
        </table>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input, { withAvatars: false });
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    expect(doc.querySelectorAll(".inline-speaker-line").length).toBe(0);
    expect(doc.querySelector('blockquote [data-speaker="hero"]')).toBeTruthy();
    expect(doc.querySelector('table[data-drama] [data-speaker="hero"]')).toBeTruthy();
  });

  it("keeps trailing narration as separate line when it starts uppercase (new sentence)", () => {
    const input = `
      <section data-chapter="1">
        <p>He said: <span data-speaker="hero">"Stop right there."</span> The crowd gasped.</p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const lines = doc.querySelectorAll("p[data-index='0'] > .inline-speaker-line");

    expect(lines.length).toBe(2);
    expect(lines[0].getAttribute("data-speaker")).toBe("hero");
    expect(lines[0].firstElementChild?.classList.contains("character-placeholder")).toBe(true);
    expect(lines[1].classList.contains("inline-speaker-line--narration")).toBe(true);
    expect(lines[1].textContent).toContain("The crowd gasped.");
  });

  it("absorbs trailing lowercase narration into preceding speaker segment", () => {
    const input = `
      <section data-chapter="1">
        <p>The street was crowded and loud before he finally leaned closer and whispered <span data-speaker="henry-clerval">"You are quite right"</span> before stepping back.</p>
      </section>
    `;
    const result = applyInlineSpeakerSegmentation(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");
    const lines = doc.querySelectorAll("p[data-index='0'] > .inline-speaker-line");

    expect(lines.length).toBe(2);
    expect(lines[0].classList.contains("inline-speaker-line--narration")).toBe(true);
    expect(lines[1].getAttribute("data-speaker")).toBe("henry-clerval");
    expect(lines[1].firstElementChild?.classList.contains("character-placeholder")).toBe(true);
    expect(lines[1].textContent).toContain("before stepping back.");
  });
});

describe("extractCharacterOccurrences", () => {
  it("dedupes speaking slugs per paragraph while reading inline speaker segments", () => {
    const input = `
      <section data-chapter="13">
        <p data-speaker="hero">I said: <span data-speaker="hero">"thus"</span> then <span data-speaker="henry-clerval">"you are right"</span>.</p>
      </section>
    `;
    const { doc, section } = parseSection(input);
    injectDataIndex(section);
    preprocessInlineSpeakerSpans(section, doc);

    const speaking = extractCharacterOccurrences(section, 13).filter(
      (occurrence) => occurrence.isSpeaking,
    );
    expect(speaking).toEqual([
      { slug: "hero", chapter: 13, paragraph: 0, isSpeaking: true },
      { slug: "henry-clerval", chapter: 13, paragraph: 0, isSpeaking: true },
    ]);
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

  it("normalizes early inline speaker into a hoisted speaker line", () => {
    const input = `
      <section data-chapter="1">
        <p>Henry said: <span data-speaker="henry-clerval">"You are quite right"</span> and then left.</p>
      </section>
    `;
    const result = normalizeChapterHtml(input);
    const { section } = parseSection(result);
    const lines = section.querySelectorAll("p[data-index='0'] > .inline-speaker-line");

    expect(lines.length).toBe(1);
    expect(lines[0].getAttribute("data-speaker")).toBe("henry-clerval");
    expect(lines[0].textContent).toContain("and then left.");
    expect(lines[0].querySelector(".character-placeholder")).toBeTruthy();
  });

  it("handles Frankenstein chapter 13 inline speaker snippet with separate narration and speech lines", () => {
    // Regression fixture source:
    // /Users/lukaszgandecki/projects/bookgenius/frontend/ConvexAssets/books/mary-shelley_frankenstein/chapters-source/chapter-13.html
    const input = `
      <section data-chapter="13">
        <p>Continuing thus, I came at length opposite to the inn at which the various diligences and carriages usually stopped. Here I paused, I knew not why; but I remained some minutes with my eyes fixed on a coach that was coming towards me from the other end of the street. As it drew nearer, I observed that it was the Swiss diligence: it stopped just where I was standing; and, on the door being opened, I perceived <span data-c="henry-clerval">Henry Clerval</span>, who, on seeing me, instantly sprung out. <span data-speaker="henry-clerval">“My dear <span data-c="victor-frankenstein">Frankenstein</span>,” exclaimed he, “how glad I am to see you! how fortunate that you should be here at the very moment of my alighting!”</span></p>
      </section>
    `;
    const result = normalizeChapterHtml(input);
    const { section } = parseSection(result);
    const paragraph = section.querySelector("p[data-index='0']");
    const lines = paragraph?.querySelectorAll(":scope > .inline-speaker-line") ?? [];

    expect(section.querySelectorAll("[data-index]").length).toBe(1);
    expect(lines.length).toBe(2);
    expect(lines[0].classList.contains("inline-speaker-line--narration")).toBe(true);
    expect(lines[0].textContent).toContain("Continuing thus");
    expect(lines[1].getAttribute("data-speaker")).toBe("henry-clerval");
    expect(lines[1].querySelector(".character-placeholder")).toBeTruthy();
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
    const result = normalizeChapterHtmlEnhanced(input, {
      speakerDisplayNames: new Map([["pooh", "Pooh"]]),
    });
    const { section } = parseSection(result);

    const playRow = section.querySelector(".play-row");
    expect(playRow).toBeTruthy();

    const label = playRow?.querySelector(".character-text p[data-is-character='true'] strong");
    expect(label?.textContent).toBe("Pooh");

    const content = playRow?.querySelector(".character-text p[data-is-character='false']");
    expect(content?.textContent).toContain("Hello");

    const placeholder = playRow?.querySelector(".character-avatar .character-placeholder");
    expect(placeholder?.getAttribute("data-character")).toBe("pooh");

    const narration = Array.from(section.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("After"),
    );
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
      const firstContentPs = firstPlayRow.querySelectorAll(
        ".character-text p[data-is-character='false']",
      );
      expect(firstContentPs.length).toBe(2);

      // Second play-row should have 1 content paragraph
      const secondPlayRow = playRows[1];
      const secondContentPs = secondPlayRow.querySelectorAll(
        ".character-text p[data-is-character='false']",
      );
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

// ---------------------------------------------------------------------------
// shiftLeadingPunctuation (tested via preprocessInlineSpeakerSpans + avatars)
// ---------------------------------------------------------------------------
describe("shiftLeadingPunctuation", () => {
  it("moves orphaned period from next segment to previous segment", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="alice">called her, as well as I could distinguish, </span><span data-speaker="bob">his sweet Arabian</span><span data-speaker="alice">. She did not appear to understand him.</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html, { withAvatars: false });
    // The period+space should move to the bob segment, not start the alice segment
    expect(result).toContain("Arabian. ");
    expect(result).not.toMatch(/data-speaker="alice"[^>]*>\s*\. She/);
  });

  it("moves orphaned comma from next segment to previous segment", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="narrator">He said</span><span data-speaker="bob">hello</span><span data-speaker="narrator">, then walked away.</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html, { withAvatars: false });
    expect(result).toContain("hello, ");
  });

  it("does not shift when segment starts with a regular word", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="alice">She said </span><span data-speaker="bob">hello there</span><span data-speaker="alice"> She continued walking.</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html, { withAvatars: false });
    expect(result).toContain("She continued");
  });

  it("moves semicolon from next segment", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="alice">she whispered </span><span data-speaker="bob">a secret</span><span data-speaker="alice">; then she fell silent.</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html, { withAvatars: false });
    expect(result).toContain("secret; ");
  });
});

// ---------------------------------------------------------------------------
// restoreNestedQuoteSpacing
// ---------------------------------------------------------------------------
describe("restoreNestedQuoteSpacing", () => {
  it("collapses regular space to hair space between nested opening quotes", () => {
    // Simulates: Creature says `" ` then companion says `'Do you consider...'`
    const html = `<section data-chapter="1">
      <p><span data-speaker="creature">\u201C <span data-speaker="companion">\u2018Do you consider,\u2019</span> said his companion.</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html, { withAvatars: false });
    // The " and ' are separated by a <span> tag in the HTML, so the hair space
    // sits between the " text node and the <span>:  "\u200A<span...>'
    expect(result).toContain('\u201C\u200A<span data-speaker="companion">');
    expect(result).not.toContain('\u201C <span data-speaker="companion">');
  });

  it("does not alter spacing when no nested quotes are involved", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="alice">She said </span><span data-speaker="bob">\u201CHello.\u201D</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html, { withAvatars: false });
    // Regular space between segments should be preserved as-is
    expect(result).toContain("said ");
  });
});

// ---------------------------------------------------------------------------
// deduplicateConsecutiveAvatars (tested via the full pipeline)
// ---------------------------------------------------------------------------
describe("deduplicateConsecutiveAvatars", () => {
  it("keeps all avatars for short runs (fewer than 4 paragraphs)", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="alice">"First paragraph."</span></p>
      <p><span data-speaker="alice">"Second paragraph."</span></p>
      <p><span data-speaker="alice">"Third paragraph."</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html);
    const { section } = parseSection(result);
    const shells = section.querySelectorAll(".character-placeholder.start-of-paragraph");
    // 3 paragraphs is below the threshold — all keep their avatars
    expect(shells).toHaveLength(3);
  });

  it("strips avatars from paragraphs 2+ in long runs (4+ paragraphs)", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="alice">"First."</span></p>
      <p><span data-speaker="alice">"Second."</span></p>
      <p><span data-speaker="alice">"Third."</span></p>
      <p><span data-speaker="alice">"Fourth."</span></p>
      <p><span data-speaker="alice">"Fifth."</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html);
    const { section } = parseSection(result);
    const shells = section.querySelectorAll(".character-placeholder.start-of-paragraph");
    // Only the first paragraph keeps the avatar
    expect(shells).toHaveLength(1);
    expect(shells[0].closest("[data-index]")?.getAttribute("data-index")).toBe("0");

    // Continuation paragraphs get the class for CSS text-indent restoration
    for (let i = 1; i <= 4; i++) {
      const p = section.querySelector(`[data-index='${i}']`) as HTMLElement;
      expect(p.classList.contains("speaker-continuation")).toBe(true);
    }
    // First paragraph should NOT have the class
    const p0 = section.querySelector("[data-index='0']") as HTMLElement;
    expect(p0.classList.contains("speaker-continuation")).toBe(false);
  });

  it("shows avatar again after a speaker change", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="alice">"Hello."</span></p>
      <p><span data-speaker="bob">"Hi there."</span></p>
      <p><span data-speaker="alice">"How are you?"</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html);
    const { section } = parseSection(result);
    const shells = section.querySelectorAll(".character-placeholder.start-of-paragraph");
    // All three should have avatars (alice, bob, alice — each is after a change)
    expect(shells).toHaveLength(3);
  });

  it("shows avatar again after a non-speaker element breaks the run", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="alice">"Before the heading."</span></p>
      <h3>Chapter Break</h3>
      <p><span data-speaker="alice">"After the heading."</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html);
    const { section } = parseSection(result);
    const shells = section.querySelectorAll(".character-placeholder.start-of-paragraph");
    // Both alice paragraphs should have avatars (heading breaks the chain)
    expect(shells).toHaveLength(2);
  });

  it("resets the run counter after a speaker change", () => {
    // alice×5 → bob → alice×3 — first run is long (deduplicated), second is short (kept)
    const html = `<section data-chapter="1">
      <p><span data-speaker="alice">"A1."</span></p>
      <p><span data-speaker="alice">"A2."</span></p>
      <p><span data-speaker="alice">"A3."</span></p>
      <p><span data-speaker="alice">"A4."</span></p>
      <p><span data-speaker="alice">"A5."</span></p>
      <p><span data-speaker="bob">"B1."</span></p>
      <p><span data-speaker="alice">"A6."</span></p>
      <p><span data-speaker="alice">"A7."</span></p>
      <p><span data-speaker="alice">"A8."</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html);
    const { section } = parseSection(result);
    const shells = section.querySelectorAll(".character-placeholder.start-of-paragraph");
    // First alice run (5 paragraphs, ≥4): 1 avatar. Bob: 1. Second alice run (3, <4): 3 avatars.
    expect(shells).toHaveLength(5);
  });

  it("shows avatar after inline speaker change leaves a different trailing speaker", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="alice">She heard </span><span data-speaker="bob">"goodbye."</span></p>
      <p><span data-speaker="alice">"Wait!"</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html);
    const { section } = parseSection(result);
    // p1 trailing=bob, p2 leading=alice → different speakers, NOT in same run
    const p2 = section.querySelector("[data-index='1']");
    const p2Shells = p2?.querySelectorAll(".character-placeholder.start-of-paragraph");
    expect(p2Shells?.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// deduplicateConsecutiveMidSentenceSpeakers
// ---------------------------------------------------------------------------
describe("deduplicateConsecutiveMidSentenceSpeakers", () => {
  it("hides the second mid-sentence avatar when the same character speaks twice in a row", () => {
    // Creature narrates with two consecutive Felix inline quotes
    const html = `<section data-chapter="1">
      <p><span data-speaker="creature">" <span data-speaker="felix">'It is utterly useless,'</span> replied Felix; <span data-speaker="felix">'we can never again inhabit your cottage.'</span></span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html);
    const { section } = parseSection(result);
    const midShells = section.querySelectorAll(".character-placeholder.mid-sentence-speaker");
    // Only the first Felix mid-sentence shell should remain
    expect(midShells).toHaveLength(1);
    expect(midShells[0].getAttribute("data-character")).toBe("felix");
  });

  it("shows both avatars when different characters speak mid-sentence", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="creature">He heard <span data-speaker="felix">'hello'</span> and <span data-speaker="agatha">'welcome'</span> from the cottage.</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html);
    const { section } = parseSection(result);
    const midShells = section.querySelectorAll(".character-placeholder.mid-sentence-speaker");
    expect(midShells).toHaveLength(2);
    expect(midShells[0].getAttribute("data-character")).toBe("felix");
    expect(midShells[1].getAttribute("data-character")).toBe("agatha");
  });

  it("shows avatar again when a different character appears between same-character quotes", () => {
    const html = `<section data-chapter="1">
      <p><span data-speaker="creature">He heard <span data-speaker="felix">'hello'</span> then <span data-speaker="agatha">'welcome'</span> then <span data-speaker="felix">'goodbye'</span> from them.</span></p>
    </section>`;
    const result = applyInlineSpeakerSegmentation(html);
    const { section } = parseSection(result);
    const midShells = section.querySelectorAll(".character-placeholder.mid-sentence-speaker");
    // felix, agatha, felix — all different from previous, all shown
    expect(midShells).toHaveLength(3);
  });
});
