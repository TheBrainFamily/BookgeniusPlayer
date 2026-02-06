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

  it("closes an opening <p> when the next line starts a new <p>", () => {
    const original = [
      "<p>'Did you not find it yourself?'</p>",
      "<p>'Yes.'</p>",
      "<p>'Then you must know where you found it?'</p>",
    ].join("\n");

    const model = [
      "<p>'Did you not find it yourself?'</p>",
      "<p>'Yes.'",
      "<p>'Then you must know where you found it?'</p>",
    ].join("\n");

    const expected = [
      "<p>'Did you not find it yourself?'</p>",
      "<p>'Yes.'</p>",
      "<p>'Then you must know where you found it?'</p>",
    ].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("merges a multi-line paragraph when closing </p> is on the next line", () => {
    const original = [
      '<p data-speaker="antony-gillingham">He explained his reasons.</p>',
      "<p>Next paragraph.</p>",
    ].join("\n");

    const model = [
      '<p data-speaker="antony-gillingham">He explained his reasons and went on:',
      "My theory is that it was obvious.</p>",
      "<p>Next paragraph.</p>",
    ].join("\n");

    const expected = [
      '<p data-speaker="antony-gillingham">He explained his reasons and went on: My theory is that it was obvious.</p>',
      "<p>Next paragraph.</p>",
    ].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("closes a paragraph at EOF when the closing tag is missing", () => {
    const original = ["<p>First.</p>", "<p>Second.</p>"].join("\n");

    const model = ["<p>First.</p>", "<p>Second."].join("\n");

    const expected = ["<p>First.</p>", "<p>Second.</p>"].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("merges a multi-line paragraph without a closing tag before the next <p>", () => {
    const original = ["<p>Alpha beta.</p>", "<p>Gamma.</p>"].join("\n");

    const model = ["<p>Alpha", "beta.", "<p>Gamma.</p>"].join("\n");

    const expected = ["<p>Alpha beta.</p>", "<p>Gamma.</p>"].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("moves stray punctuation before a <p> tag inside the paragraph", () => {
    const original = [
      '<p data-speaker="matthew-cayley">“Robert Ablett.”</p>',
      "<p>Next line.</p>",
    ].join("\n");

    const model = [
      '“ <p data-speaker="matthew-cayley"><span data-c="robert-ablett">Robert Ablett</span>.”</p>',
      "<p>Next line.</p>",
    ].join("\n");

    const expected = [
      '<p data-speaker="matthew-cayley">“<span data-c="robert-ablett">Robert Ablett</span>.”</p>',
      "<p>Next line.</p>",
    ].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("splits a line when a new <p> starts mid-line", () => {
    const original = ["<p>Bill looked at him.</p>", "<p>Antony took his arm.</p>"].join("\n");

    const model = "Bill looked at him. <p>Antony took his arm.</p>";

    const expected = ["<p>Bill looked at him.</p>", "<p>Antony took his arm.</p>"].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("wraps restored bare text inserted between two paragraph tags", () => {
    const original = [
      "<p>Once ... He quoted from the <i>Luzumiyat</i> to show that the poet-philosopher was a true Sufi.</p>",
      '<p data-speaker="distinguished-sufi-host">"In his passionate hatred ..."</p>',
    ].join("\n");

    const model = [
      "<p>Once ...</p>",
      "He quoted from the Luzumiyat to show that the poet-philosopher was a true Sufi.",
      '<p data-speaker="distinguished-sufi-host">"In his passionate hatred ..."</p>',
    ].join("\n");

    const expected = [
      "<p>Once ...</p>",
      "<p>He quoted from the Luzumiyat to show that the poet-philosopher was a true Sufi.</p>",
      '<p data-speaker="distinguished-sufi-host">"In his passionate hatred ..."</p>',
    ].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });

  it("wraps restored bare text when it is inline between </p> and the next <p>", () => {
    const original = [
      "<p>Once ... He quoted from the <i>Luzumiyat</i> to show that the poet-philosopher was a true Sufi.</p>",
      '<p data-speaker="distinguished-sufi-host">"In his passionate hatred ..."</p>',
    ].join("\n");

    const model =
      '<p>Once ...</p> He quoted from the Luzumiyat to show that the poet-philosopher was a true Sufi. <p data-speaker="distinguished-sufi-host">"In his passionate hatred ..."</p>';

    const expected = [
      "<p>Once ...</p>",
      "<p>He quoted from the Luzumiyat to show that the poet-philosopher was a true Sufi.</p>",
      '<p data-speaker="distinguished-sufi-host">"In his passionate hatred ..."</p>',
    ].join("\n");

    expect(restoreUnwrappedLines(original, model)).toBe(expected);
  });
});
