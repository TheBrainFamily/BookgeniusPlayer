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

  it("repairs a line that closes a </p> without opening it", () => {
    const original = [
      "<p>'Then you must know where you found it?'</p>",
      "<p>'Yes, it was on the prisoner's wardrobe.'</p>",
      "<p data-speaker=\"mr-philips-kc\">'That is better.'</p>",
    ].join("\n");

    const model = [
      "<p>'Then you must know where you found it?'</p>",
      "'Yes, it was on the <span data-c=\"john-cavendish\">prisoner</span>'s wardrobe.'</p>",
      "<p data-speaker=\"mr-philips-kc\">'That is better.'</p>",
    ].join("\n");

    const expected = [
      "<p>'Then you must know where you found it?'</p>",
      "<p>'Yes, it was on the <span data-c=\"john-cavendish\">prisoner</span>'s wardrobe.'</p>",
      "<p data-speaker=\"mr-philips-kc\">'That is better.'</p>",
    ].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("repairs orphan </p> when model output is a single line", () => {
    const original = [
      "<p>'Then you must know where you found it?'</p>",
      "<p>'Yes, it was on the prisoner's wardrobe.'</p>",
      "<p data-speaker=\"mr-philips-kc\">'That is better.'</p>",
    ].join("\n");

    const model =
      "<p>'Then you must know where you found it?'</p>" +
      "'Yes, it was on the <span data-c=\"john-cavendish\">prisoner</span>'s wardrobe.'</p>" +
      "<p data-speaker=\"mr-philips-kc\">'That is better.'</p>";

    const expected = [
      "<p>'Then you must know where you found it?'</p>",
      "<p>'Yes, it was on the <span data-c=\"john-cavendish\">prisoner</span>'s wardrobe.'</p>",
      "<p data-speaker=\"mr-philips-kc\">'That is better.'</p>",
    ].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("wraps multiple consecutive bare lines using original wrappers", () => {
    const original = ["<p>One.</p>", "<p>Two.</p>", "<p>Three.</p>"].join("\n");

    const model = ["<p>One.</p>", "Two.", "Three."].join("\n");

    const expected = ["<p>One.</p>", "<p>Two.</p>", "<p>Three.</p>"].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("wraps a bare line with inline tags and trailing </p>", () => {
    const original = ["<p>She saw the prisoner.</p>", "<p>It was unexpected.</p>"].join("\n");

    const model = [
      "<p>She saw the prisoner.</p>",
      '  It was <span data-c="john-cavendish">unexpected</span>.</p>',
    ].join("\n");

    const expected = [
      "<p>She saw the prisoner.</p>",
      '  <p>It was <span data-c="john-cavendish">unexpected</span>.</p>',
    ].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("keeps concatenated <p> tags on a single line unchanged", () => {
    const original = ["<p>One.</p>", "<p>Two.</p>"].join("\n");
    const model = "<p>One.</p><p>Two.</p>";

    expect(restoreUnwrappedLines(original, model)).toBe(model);
  });
});
