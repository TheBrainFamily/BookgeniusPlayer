import { describe, it, expect } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { renderEmElement, isLikelyCharacterTag } from "./xmlDomHelpers";

const parseElement = (xml: string): Element => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<root>${xml}</root>`, "text/xml");

  return doc.documentElement!.firstChild! as unknown as Element;
};

describe("isLikelyCharacterTag", () => {
  it("returns true for uppercase starting tags", () => {
    expect(isLikelyCharacterTag("Theseus")).toBe(true);
    expect(isLikelyCharacterTag("Master-Bodhi")).toBe(true);
    expect(isLikelyCharacterTag("Wukong")).toBe(true);
  });

  it("returns false for lowercase tags", () => {
    expect(isLikelyCharacterTag("p")).toBe(false);
    expect(isLikelyCharacterTag("span")).toBe(false);
    expect(isLikelyCharacterTag("em")).toBe(false);
  });
});

describe("renderEmElement", () => {
  it("renders basic em element with text", () => {
    const em = parseElement("<em>Enter stage left.</em>");
    const html = renderEmElement(em);

    expect(html).toBe("<em>Enter stage left.</em>");
  });

  it("preserves character elements with enters attribute", () => {
    const em = parseElement(
      '<em>Enter <Theseus enters="true">Theseus</Theseus> and <Hippolyta enters="true">Hippolyta</Hippolyta>.</em>',
    );
    const html = renderEmElement(em);

    expect(html).toContain('data-c="theseus"');
    expect(html).toContain('data-enters="true"');
    expect(html).toContain(">Theseus</span>");
    expect(html).toContain('data-c="hippolyta"');
  });

  it("preserves character elements with exits attribute", () => {
    const em = parseElement('<em><Theseus exits="true"/>Exeunt.</em>');
    const html = renderEmElement(em);

    expect(html).toContain('data-c="theseus"');
    expect(html).toContain('data-exits="true"');
  });

  it("handles character with both enters and exits", () => {
    const em = parseElement('<em><Theseus enters="true" exits="true"/>Passes through.</em>');
    const html = renderEmElement(em);

    expect(html).toContain('data-enters="true"');
    expect(html).toContain('data-exits="true"');
  });

  it("handles character elements without enters/exits", () => {
    const em = parseElement("<em>mentions <Theseus>Theseus</Theseus> in passing.</em>");
    const html = renderEmElement(em);

    expect(html).toContain('data-c="theseus"');
    expect(html).not.toContain("data-enters");
    expect(html).not.toContain("data-exits");
  });

  it("handles LineBreak elements", () => {
    const em = parseElement("<em>Line one.<LineBreak/>Line two.</em>");
    const html = renderEmElement(em);

    // LineBreak renders as a span with display:block style
    expect(html).toContain("<span");
    expect(html).toContain("display:block");
  });

  it("preserves class attribute on em element", () => {
    const em = parseElement('<em class="stage-direction">Enter all.</em>');
    const html = renderEmElement(em);

    expect(html).toBe('<em class="stage-direction">Enter all.</em>');
  });

  it("handles mixed content with characters and text", () => {
    const em = parseElement(
      '<em>Enter <Theseus enters="true">Theseus</Theseus>, <Hippolyta enters="true">Hippolyta</Hippolyta>, and Attendants.</em>',
    );
    const html = renderEmElement(em);

    expect(html).toContain("Enter ");
    expect(html).toContain(", ");
    expect(html).toContain("and Attendants.");
    expect(html).toContain('data-c="theseus"');
    expect(html).toContain('data-c="hippolyta"');
  });
});
