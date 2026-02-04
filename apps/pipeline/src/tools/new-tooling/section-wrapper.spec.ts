import { describe, expect, it } from "vitest";
import { buildSectionWrapper, extractSectionInner, parseAttributes } from "./section-wrapper";

describe("section-wrapper", () => {
  it("parses attributes with quotes", () => {
    const attrs = parseAttributes(' data-chapter="2" data-epub-type="chapter"');
    expect(attrs).toEqual({ "data-chapter": "2", "data-epub-type": "chapter" });
  });

  it("parses attributes with mixed quotes and unquoted values", () => {
    const attrs = parseAttributes(" data-id='x' data-num=3 data-flag ");
    expect(attrs).toEqual({ "data-id": "x", "data-num": "3", "data-flag": "" });
  });

  it("extracts section inner and wrapper", () => {
    const html = '<section data-chapter="2" data-epub-type="chapter"><p>Hi</p></section>';
    const result = extractSectionInner(html);
    expect(result.inner).toBe("<p>Hi</p>");
    expect(result.wrapper).toEqual({
      tagName: "section",
      attributes: { "data-chapter": "2", "data-epub-type": "chapter" },
    });
  });

  it("returns original text when no section wrapper", () => {
    const html = "<p>Hi</p>";
    const result = extractSectionInner(html);
    expect(result.inner).toBe(html);
    expect(result.wrapper).toBeNull();
  });

  it("rebuilds section wrapper with attributes", () => {
    const html = '<section data-chapter="2" data-epub-type="chapter"><p>Hi</p></section>';
    const result = extractSectionInner(html);
    expect(buildSectionWrapper(result.inner, result.wrapper)).toBe(html);
  });
});
