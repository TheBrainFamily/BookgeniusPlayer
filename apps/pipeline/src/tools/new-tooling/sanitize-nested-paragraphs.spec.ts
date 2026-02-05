import { describe, expect, it } from "vitest";
import { sanitizeNestedParagraphs } from "./sanitize-nested-paragraphs";

describe("sanitizeNestedParagraphs", () => {
  it("removes nested <p> tags inside a paragraph and keeps inner text", () => {
    const input =
      '<p>Alpha <p data-speaker="the-board">\u201cOho!\u201d said the board.</p> Omega</p>';

    const expected = "<p>Alpha \u201cOho!\u201d said the board. Omega</p>";

    expect(sanitizeNestedParagraphs(input)).toBe(expected);
  });

  it("leaves normal paragraphs unchanged", () => {
    const input = "<p>One.</p>\n<p>Two.</p>";
    expect(sanitizeNestedParagraphs(input)).toBe(input);
  });

  it("handles multiple nested paragraphs in one block", () => {
    const input = '<p>Start <p data-speaker="a">A</p> mid <p data-speaker="b">B</p> end</p>';
    const expected = "<p>Start A mid B end</p>";
    expect(sanitizeNestedParagraphs(input)).toBe(expected);
  });
});
