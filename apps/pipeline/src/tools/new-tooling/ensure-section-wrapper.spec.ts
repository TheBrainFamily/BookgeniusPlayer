import { describe, expect, it } from "vitest";
import { ensureSectionWrapper } from "./ensure-section-wrapper";

describe("ensureSectionWrapper", () => {
  it("passes through valid section wrappers", () => {
    const input = '<section data-chapter="2"><p>Hi</p></section>';
    expect(ensureSectionWrapper(input)).toBe(input);
  });

  it("accepts additional attributes", () => {
    const input = '<section data-chapter="2" data-epub-type="chapter"><p>Hi</p></section>';
    expect(ensureSectionWrapper(input)).toBe(input);
  });

  it("throws when section wrapper is missing", () => {
    const input = "<p>Hi</p>";
    expect(() => ensureSectionWrapper(input)).toThrow("Missing <section data-chapter> wrapper");
  });
});
