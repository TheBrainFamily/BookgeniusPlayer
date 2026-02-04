import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { fixNonPlayCustomTags } from "./fix-non-play-custom-tags";

function parseSection(html: string): Element {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const section = doc.querySelector("section[data-chapter]");
  if (!section) {
    throw new Error("Missing section[data-chapter] in test input");
  }
  return section;
}

describe("fixNonPlayCustomTags", () => {
  it("converts note tags to link-note anchors", () => {
    const input = `
      <section data-chapter="1">
        <p>Text before<note id='2'></note>after.</p>
      </section>
    `;

    const result = fixNonPlayCustomTags(input);
    const section = parseSection(result);

    const note = section.querySelector('a.link-note[data-note="2"]');
    expect(note?.textContent).toBe("2");
    expect(section.querySelector("note")).toBeNull();
  });

  it("converts self-closing note tags to link-note anchors", () => {
    const input = `
      <section data-chapter="1">
        <p>See here<note id="448"/>.</p>
      </section>
    `;

    const result = fixNonPlayCustomTags(input);
    const section = parseSection(result);

    const note = section.querySelector('a.link-note[data-note="448"]');
    expect(note?.textContent).toBe("448");
    expect(section.querySelector("note")).toBeNull();
  });

  it("converts inline custom tags to spans with data-c", () => {
    const input = `
      <section data-chapter="1">
        <p>Hyades, <hastur>Hastur</hastur>, and Aldebaran.</p>
      </section>
    `;

    const result = fixNonPlayCustomTags(input);
    const section = parseSection(result);

    const hastur = section.querySelector('span[data-c="hastur"]');
    expect(hastur?.textContent).toBe("Hastur");
    expect(section.querySelector("hastur")).toBeNull();
  });

  it("promotes empty custom tags at start of a paragraph to data-speaker", () => {
    const input = `
      <section data-chapter="1">
        <p data-index="123"> <stoj-pal></stoj-pal>— Stój! Pal!</p>
      </section>
    `;

    const result = fixNonPlayCustomTags(input);
    const section = parseSection(result);
    const paragraph = section.querySelector('p[data-index="123"]');

    expect(paragraph?.getAttribute("data-speaker")).toBe("stoj-pal");
    expect(section.querySelector("stoj-pal")).toBeNull();
    expect(paragraph?.textContent?.trim().startsWith("— Stój! Pal!")).toBe(true);
  });

  it("treats self-closing talking tags at start as speakers", () => {
    const input = `
      <section data-chapter="1">
        <p class="verse"><Alice talking="true"/>'How doth the little crocodile</p>
      </section>
    `;

    const result = fixNonPlayCustomTags(input);
    const section = parseSection(result);
    const paragraph = section.querySelector("p.verse");

    expect(paragraph?.getAttribute("data-speaker")).toBe("alice");
    expect(section.querySelector("alice")).toBeNull();
  });

  it("leaves hgroup tags intact", () => {
    const input = `
      <section data-chapter="1">
        <hgroup><h2>Title</h2></hgroup>
      </section>
    `;

    const result = fixNonPlayCustomTags(input);
    const section = parseSection(result);
    expect(section.querySelector("hgroup")).not.toBeNull();
  });

  it("handles invalid see tags by preserving the reference", () => {
    const input = `
      <section data-chapter="1">
        <p><see 05.05.Sketch.gif></p>
      </section>
    `;

    const result = fixNonPlayCustomTags(input);
    const section = parseSection(result);

    const see = section.querySelector('span[data-see="05.05.Sketch.gif"]');
    expect(see).not.toBeNull();
    expect(section.querySelector('span[data-c="see"]')).toBeNull();
    expect(section.querySelector("see")).toBeNull();
  });
});
