import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { fixLegacyPlayCustomTags } from "./fix-legacy-play-custom-tags";

function parseSection(html: string): Element {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const section = doc.querySelector("section[data-chapter]");
  if (!section) {
    throw new Error("Missing section[data-chapter] in test input");
  }
  return section;
}

describe("fixLegacyPlayCustomTags", () => {
  it("converts non-HTML tags outside em to spans with data-c", () => {
    const input = `
      <section data-chapter="7">
        <p class="verse"><Hamlet>HAMLET</Hamlet>.</p>
        <p class="verse">O dear <Ophelia>Ophelia</Ophelia>, I am ill at these numbers.</p>
      </section>
    `;

    const result = fixLegacyPlayCustomTags(input);
    const section = parseSection(result);

    const hamlet = section.querySelector('span[data-c="hamlet"]');
    const ophelia = section.querySelector('span[data-c="ophelia"]');

    expect(hamlet?.textContent).toBe("HAMLET");
    expect(ophelia?.textContent).toBe("Ophelia");

    expect(section.querySelector("hamlet")).toBeNull();
    expect(section.querySelector("ophelia")).toBeNull();
  });

  it("preserves custom attributes and maps enters/exits to data-* while dropping raw attrs", () => {
    const input = `
      <section data-chapter="2">
        <p>House of <Capulet dynasty="true" enters="true">Capulet</Capulet>.</p>
      </section>
    `;

    const result = fixLegacyPlayCustomTags(input);
    const section = parseSection(result);

    const capulet = section.querySelector(
      'span[data-c="capulet"][data-enters="true"][dynasty="true"]',
    );

    expect(capulet?.textContent).toBe("Capulet");
    expect(capulet?.hasAttribute("enters")).toBe(false);
    expect(capulet?.hasAttribute("exits")).toBe(false);
  });

  it("does not convert valid HTML tags like cite", () => {
    const input = `
      <section data-chapter="1">
        <p>Source: <cite>Some Book</cite>.</p>
      </section>
    `;

    const result = fixLegacyPlayCustomTags(input);
    const section = parseSection(result);
    const cite = section.querySelector("cite");

    expect(cite?.textContent).toBe("Some Book");
    expect(section.querySelector('span[data-c="cite"]')).toBeNull();
  });
});
