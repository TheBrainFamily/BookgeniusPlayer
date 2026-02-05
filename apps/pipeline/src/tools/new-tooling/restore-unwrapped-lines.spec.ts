import { describe, expect, it } from "vitest";
import { restoreUnwrappedLines } from "./restore-unwrapped-lines";

describe("restoreUnwrappedLines", () => {
  it("wraps a bare text line using the original <p> wrapper", () => {
    const original = [
      "<p>One.</p>",
      '<p data-speaker="mary-cavendish">Two <span data-c="evelyn-howard">Evelyn</span>.</p>',
      "<p>Miss Howard nodded grimly.</p>",
    ].join("\n");

    const model = [
      "<p>One.</p>",
      '<p data-speaker="mary-cavendish">Two <span data-c="evelyn-howard">Evelyn</span>.</p>',
      "Miss Howard nodded grimly.",
    ].join("\n");

    const expected = [
      "<p>One.</p>",
      '<p data-speaker="mary-cavendish">Two <span data-c="evelyn-howard">Evelyn</span>.</p>',
      "<p>Miss Howard nodded grimly.</p>",
    ].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("preserves indentation when wrapping", () => {
    const original = ["<p>Intro.</p>", "<p>Indented line.</p>"].join("\n");

    const model = ["<p>Intro.</p>", "  Indented line."].join("\n");

    const expected = ["<p>Intro.</p>", "  <p>Indented line.</p>"].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });
});
