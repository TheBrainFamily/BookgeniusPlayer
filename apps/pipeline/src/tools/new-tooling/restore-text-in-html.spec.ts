import { describe, test, expect } from "vitest";
import { restoreOriginalTextInHtml } from "./restore-text-in-html";

describe("restoreOriginalTextInHtml", () => {
  describe("basic functionality", () => {
    test("returns model as-is when texts are identical", () => {
      const original = "<p>Hello world</p>";
      const model = "<p>Hello world</p>";

      expect(restoreOriginalTextInHtml(original, model)).toBe(model);
    });

    test("preserves data-speaker attribute while fixing typo", () => {
      const original = "<p>Hello world</p>";
      const model = '<p data-speaker="alice">Helo world</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe('<p data-speaker="alice">Hello world</p>');
    });

    test("preserves span data-c wrapper while fixing typo inside", () => {
      const original = "<p>Alice said hello</p>";
      const model = '<p><span data-c="alice">Alise</span> said hello</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe('<p><span data-c="alice">Alice</span> said hello</p>');
    });

    test("preserves span data-c wrapper while fixing typo outside", () => {
      const original = "<p>Alice said hello</p>";
      const model = '<p><span data-c="alice">Alice</span> siad hello</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe('<p><span data-c="alice">Alice</span> said hello</p>');
    });
  });

  describe("Polish text with diacritics", () => {
    test("fixes diacritic typo (e vs ę)", () => {
      const original = "<p>Książę spojrzał na Sarę.</p>";
      const model =
        '<p data-speaker="sara"><span data-c="ksiaze-ramzes">Książe</span> spojrzał na <span data-c="sara">Sarę</span>.</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe(
        '<p data-speaker="sara"><span data-c="ksiaze-ramzes">Książę</span> spojrzał na <span data-c="sara">Sarę</span>.</p>',
      );
    });

    test("fixes diacritic typo (ą vs a)", () => {
      const original = "<p>Książę patrzył na królową.</p>";
      const model = '<p><span data-c="prince">Książę</span> patrzyl na królowa.</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe('<p><span data-c="prince">Książę</span> patrzył na królową.</p>');
    });
  });

  describe("multiple speakers and mentions", () => {
    test("handles multiple span wrappers", () => {
      const original = "<p>Winston saw Julia near the telescreen.</p>";
      const model =
        '<p><span data-c="winston">Winston</span> saw <span data-c="julia">Julia</span> near the telscreen.</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe(
        '<p><span data-c="winston">Winston</span> saw <span data-c="julia">Julia</span> near the telescreen.</p>',
      );
    });

    test("handles multiple speakers in data-speaker", () => {
      const original = "<p>Happy birthday! they sang together.</p>";
      const model = '<p data-speaker="alice bob">Happy brithday! they sang together.</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe('<p data-speaker="alice bob">Happy birthday! they sang together.</p>');
    });
  });

  describe("preserves existing HTML structure", () => {
    test("preserves em tags", () => {
      const original = "<p>She was <em>very</em> angry.</p>";
      const model = '<p data-speaker="alice">She was <em>very</em> angery.</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe('<p data-speaker="alice">She was <em>very</em> angry.</p>');
    });

    test("preserves strong tags", () => {
      const original = "<p>This is <strong>important</strong> information.</p>";
      const model = "<p>This is <strong>important</strong> informaton.</p>";

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe("<p>This is <strong>important</strong> information.</p>");
    });

    test("preserves br tags", () => {
      const original = "<p>Line one.<br/>Line two.</p>";
      const model = '<p data-speaker="narrator">Line one.<br/>Line too.</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe('<p data-speaker="narrator">Line one.<br/>Line two.</p>');
    });
  });

  describe("whitespace handling", () => {
    test("fixes added whitespace", () => {
      const original = "<p>Hello world</p>";
      const model = '<p data-speaker="alice">Hello  world</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe('<p data-speaker="alice">Hello world</p>');
    });

    test("fixes removed whitespace", () => {
      const original = "<p>Hello world</p>";
      const model = '<p data-speaker="alice">Helloworld</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe('<p data-speaker="alice">Hello world</p>');
    });
  });

  describe("edge cases", () => {
    test("handles empty spans", () => {
      const original = "<p>Text here</p>";
      const model = '<p><span data-c="someone"></span>Text here</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe('<p><span data-c="someone"></span>Text here</p>');
    });

    test("handles self-closing tags", () => {
      const original = "<p>Before<br/>After</p>";
      const model = '<p data-speaker="x">Before<br/>Aftr</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe('<p data-speaker="x">Before<br/>After</p>');
    });

    test("handles nested spans (data-c inside em)", () => {
      const original = "<p>She said <em>Alice was right</em>.</p>";
      const model =
        '<p data-speaker="bob">She said <em><span data-c="alice">Alice</span> was rigt</em>.</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe(
        '<p data-speaker="bob">She said <em><span data-c="alice">Alice</span> was right</em>.</p>',
      );
    });
  });

  describe("tolerance handling", () => {
    test("returns model as-is when drift exceeds default tolerance", () => {
      const original = "<p>Hello world</p>";
      const model = '<p data-speaker="alice">Completely different text here</p>';

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe(model);
    });

    test("returns model as-is with strict 5% tolerance when drift is 20%", () => {
      const original = "<p>Hello</p>";
      const model = '<p data-speaker="alice">Helo</p>';

      const resultStrict = restoreOriginalTextInHtml(original, model, 0.05);

      expect(resultStrict).toBe(model);
    });

    test("fixes text with lenient 25% tolerance when drift is 20%", () => {
      const original = "<p>Hello</p>";
      const model = '<p data-speaker="alice">Helo</p>';

      const resultLenient = restoreOriginalTextInHtml(original, model, 0.25);

      expect(resultLenient).toBe('<p data-speaker="alice">Hello</p>');
    });
  });

  describe("multi-paragraph sections", () => {
    test("handles section with multiple paragraphs", () => {
      const original = `<section data-chapter="1">
<p>First paragraph here.</p>
<p>Second paragraph there.</p>
</section>`;
      const model = `<section data-chapter="1">
<p data-speaker="alice">First paragrap here.</p>
<p data-speaker="bob">Second paragraph ther.</p>
</section>`;

      const result = restoreOriginalTextInHtml(original, model);

      expect(result).toBe(`<section data-chapter="1">
<p data-speaker="alice">First paragraph here.</p>
<p data-speaker="bob">Second paragraph there.</p>
</section>`);
    });
  });
});
