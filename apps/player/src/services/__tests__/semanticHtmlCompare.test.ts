/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import {
  semanticHtmlEquals,
  extractSemanticStructure,
  prettyPrintSemantic,
} from "./semanticHtmlCompare";

describe("semanticHtmlEquals", () => {
  it("matches identical HTML", () => {
    const html = '<section data-chapter="1"><p>Hello</p></section>';
    const result = semanticHtmlEquals(html, html);
    expect(result.match).toBe(true);
  });

  it("ignores whitespace differences", () => {
    const htmlA = '<section data-chapter="1"><p>Hello</p></section>';
    const htmlB = `<section data-chapter="1">
      <p>Hello</p>
    </section>`;
    const result = semanticHtmlEquals(htmlA, htmlB);
    expect(result.match).toBe(true);
  });

  it("ignores whitespace between elements", () => {
    const htmlA = '<section data-chapter="1"><p>Line 1</p><p>Line 2</p></section>';
    const htmlB = `<section data-chapter="1">
      <p>Line 1</p>
      <p>Line 2</p>
    </section>`;
    const result = semanticHtmlEquals(htmlA, htmlB);
    expect(result.match).toBe(true);
  });

  it("detects text differences", () => {
    const htmlA = '<section data-chapter="1"><p>Hello</p></section>';
    const htmlB = '<section data-chapter="1"><p>World</p></section>';
    const result = semanticHtmlEquals(htmlA, htmlB);
    expect(result.match).toBe(false);
    expect(result.diff).toContain("text mismatch");
  });

  it("detects tag differences", () => {
    const htmlA = '<section data-chapter="1"><p>Hello</p></section>';
    const htmlB = '<section data-chapter="1"><div>Hello</div></section>';
    const result = semanticHtmlEquals(htmlA, htmlB);
    expect(result.match).toBe(false);
    expect(result.diff).toContain("tag mismatch");
  });

  it("detects attribute differences", () => {
    const htmlA = '<section data-chapter="1"><p class="foo">Hello</p></section>';
    const htmlB = '<section data-chapter="1"><p class="bar">Hello</p></section>';
    const result = semanticHtmlEquals(htmlA, htmlB);
    expect(result.match).toBe(false);
    expect(result.diff).toContain("@class");
  });

  it("detects missing attributes", () => {
    const htmlA = '<section data-chapter="1"><p data-speaker="bob">Hello</p></section>';
    const htmlB = '<section data-chapter="1"><p>Hello</p></section>';
    const result = semanticHtmlEquals(htmlA, htmlB);
    expect(result.match).toBe(false);
    expect(result.diff).toContain("@data-speaker");
  });

  it("detects child count differences", () => {
    const htmlA = '<section data-chapter="1"><p>One</p><p>Two</p></section>';
    const htmlB = '<section data-chapter="1"><p>One</p></section>';
    const result = semanticHtmlEquals(htmlA, htmlB);
    expect(result.match).toBe(false);
    expect(result.diff).toContain("child count mismatch");
  });

  it("matches complex nested structures", () => {
    const htmlA = `<section data-chapter="1">
      <div class="play-row" data-speaker="bob">
        <div class="character-avatar"></div>
        <div class="character-text">
          <p data-is-character="true"><strong>BOB</strong></p>
          <p>Hello world</p>
        </div>
      </div>
    </section>`;

    const htmlB = `<section data-chapter="1"><div class="play-row" data-speaker="bob"><div class="character-avatar"></div><div class="character-text"><p data-is-character="true"><strong>BOB</strong></p><p>Hello world</p></div></div></section>`;

    const result = semanticHtmlEquals(htmlA, htmlB);
    expect(result.match).toBe(true);
  });

  it("handles self-closing vs non-self-closing empty elements", () => {
    const htmlA = '<section data-chapter="1"><div class="avatar"></div></section>';
    const htmlB = '<section data-chapter="1"><div class="avatar"/></section>';
    const result = semanticHtmlEquals(htmlA, htmlB);
    expect(result.match).toBe(true);
  });
});

describe("extractSemanticStructure", () => {
  it("extracts section[data-chapter] as root", () => {
    const html = '<section data-chapter="1"><p>Hello</p></section>';
    const struct = extractSemanticStructure(html);
    expect(struct?.tag).toBe("section");
    expect(struct?.attributes?.["data-chapter"]).toBe("1");
  });

  it("ignores whitespace-only text nodes", () => {
    const html = `<section data-chapter="1">
      <p>Hello</p>
    </section>`;
    const struct = extractSemanticStructure(html);
    expect(struct?.children?.length).toBe(1);
    expect(struct?.children?.[0].tag).toBe("p");
  });
});

describe("prettyPrintSemantic", () => {
  it("prints readable structure", () => {
    const html = '<section data-chapter="1"><p>Hello</p></section>';
    const struct = extractSemanticStructure(html);
    const printed = prettyPrintSemantic(struct);
    expect(printed).toContain("section");
    expect(printed).toContain('data-chapter="1"');
    expect(printed).toContain("Hello");
  });
});
