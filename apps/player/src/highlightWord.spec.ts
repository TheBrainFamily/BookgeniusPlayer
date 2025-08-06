// Filename: highlightNthOccurrence.test.ts
// @jest-environment jsdom

// --- Assume highlightNthOccurrence function is defined or imported here ---
// Example: import { highlightNthOccurrence } from './your-highlighter-module';

/*
// For self-contained testing, you'd paste the function here:
function highlightNthOccurrence(
  htmlText: string,
  wordToFind: string,
  // ... rest of the function from the previous response
) {
  // ... implementation ...
}
*/
// --- End of function definition assumption ---

import { highlightNthOccurrence } from "@/highlightWord";

describe("highlightNthOccurrence", () => {
  const DEFAULT_CLASS = "current-word";
  const FADE_CLASS = "last-word-auto-fade";
  const GENERATED_MARKER_ATTR = "data-highlight-generated"; // For attribute querying
  const GENERATED_MARKER_HTML = `${GENERATED_MARKER_ATTR}="true"`; // For HTML string matching

  // Helper to simulate the environment if needed, though Jest with jsdom provides document
  let testBed: HTMLDivElement;
  beforeEach(() => {
    document.body.innerHTML = ""; // Clear body from previous tests
    testBed = document.createElement("div");
    document.body.appendChild(testBed); // Not strictly used if passing htmlText, but good practice
  });

  // --- Basic Highlighting Tests ---
  test("should highlight a simple word in plain text by creating a new span", () => {
    const html = "<p>Hello world example.</p>";
    const expected = `<p>Hello <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>world</span> example.</p>`;
    const result = highlightNthOccurrence(html, "world", 0, DEFAULT_CLASS);
    expect(result).toBe(expected);
  });

  test("should highlight the Nth occurrence of a word in plain text", () => {
    const html = "<p>test test test.</p>";
    const expected = `<p>test <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>test</span> test.</p>`;
    const result = highlightNthOccurrence(html, "test", 1, DEFAULT_CLASS); // 2nd "test" (index 1)
    expect(result).toBe(expected);
  });

  test("should be case-sensitive when finding word and preserve original case in highlight", () => {
    const html = "<p>Hello world example World.</p>";
    const expected = `<p>Hello world example <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>World</span>.</p>`;
    const result = highlightNthOccurrence(html, "World", 0, DEFAULT_CLASS);
    expect(result).toBe(expected);
  });

  // --- Whole Word Matching Tests ---
  test('should not highlight substring "to" in "vector"', () => {
    const html = "<p>This is a vector.</p>";
    const result = highlightNthOccurrence(html, "to", 0, DEFAULT_CLASS);
    expect(result).toBe(html); // No change
  });

  test('should highlight "to" when it is a whole word', () => {
    const html = "<p>Go to the store.</p>";
    const expected = `<p>Go <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>to</span> the store.</p>`;
    const result = highlightNthOccurrence(html, "to", 0, DEFAULT_CLASS);
    expect(result).toBe(expected);
  });

  test('should highlight word followed by punctuation (e.g., "cat.")', () => {
    const html = "<p>It is a cat.</p>";
    const expected = `<p>It is a <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>cat</span>.</p>`;
    const result = highlightNthOccurrence(html, "cat", 0, DEFAULT_CLASS);
    expect(result).toBe(expected);
  });

  test('should highlight word preceded by punctuation (e.g., "(cat)")', () => {
    const html = "<p>Look, a (cat) is here.</p>";
    const expected = `<p>Look, a (<span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>cat</span>) is here.</p>`;
    const result = highlightNthOccurrence(html, "cat", 0, DEFAULT_CLASS);
    expect(result).toBe(expected);
  });

  // --- Highlighting Word Inside Existing SPAN (Wraps the existing SPAN) ---
  describe("Highlighting words within existing user SPANs", () => {
    test("should wrap the existing parent SPAN if word is found inside its text node", () => {
      const html = '<p>The quick <span class="user-style">brown fox</span> jumps.</p>';
      const wordToFind = "brown";
      const expected = `<p>The quick <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}><span class="user-style">brown fox</span></span> jumps.</p>`;
      const result = highlightNthOccurrence(html, wordToFind, 0, DEFAULT_CLASS);
      expect(result).toBe(expected);
    });

    test("should wrap existing SPAN when highlighting sequential words inside it", () => {
      const html = '<p>This is <span id="S1" class="user-span">Mr. Pan Verloc</span> talking.</p>';

      // Highlight "Pan"
      let result = highlightNthOccurrence(html, "Pan", 0, DEFAULT_CLASS);
      const expectedStep1 = `<p>This is <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}><span id="S1" class="user-span">Mr. Pan Verloc</span></span> talking.</p>`;
      expect(result).toBe(expectedStep1);

      // Highlight "Verloc" (from the same original span content)
      // The previous wrapper around S1 will be cleaned up first.
      result = highlightNthOccurrence(result, "Verloc", 0, DEFAULT_CLASS);
      const expectedStep2 = `<p>This is <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}><span id="S1" class="user-span">Mr. Pan Verloc</span></span> talking.</p>`;
      expect(result).toBe(expectedStep2);
    });

    test("should correctly wrap parent SPAN containing only the word with surrounding spaces", () => {
      const html = '<p>Prefix <span id="s1">  wordInSpan  </span> Suffix.</p>';
      const wordToFind = "wordInSpan";
      const expected = `<p>Prefix <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}><span id="s1">  wordInSpan  </span></span> Suffix.</p>`;
      const result = highlightNthOccurrence(html, wordToFind, 0, DEFAULT_CLASS);
      expect(result).toBe(expected);
    });

    test("should preserve attributes and other classes of the wrapped existing SPAN", () => {
      const html = '<p>Text <span class="char-hl other-class" data-id="123" style="color: blue;">pan Verloc</span> end.</p>';
      const expected = `<p>Text <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}><span class="char-hl other-class" data-id="123" style="color: blue;">pan Verloc</span></span> end.</p>`;
      const result = highlightNthOccurrence(html, "pan", 0, DEFAULT_CLASS);
      expect(result).toBe(expected);
    });
  });

  // --- Fallback: Highlighting Word NOT Inside a Reusable Parent SPAN ---
  describe("Highlighting words not in immediate parent SPANs (fallback behavior)", () => {
    test("should create specific inner span for word directly in a P tag", () => {
      const html = "<p>A plain word in a paragraph.</p>";
      const expected = `<p>A plain <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>word</span> in a paragraph.</p>`;
      const result = highlightNthOccurrence(html, "word", 0, DEFAULT_CLASS);
      expect(result).toBe(expected);
    });

    test("should create specific inner span for word directly in a SPAN tag", () => {
      const html =
        'stawał <span class="character-highlighted character-highlighted-activated" data-character="Pan-Verloc" data-src-listening="/Conrad-Tajny-Agent/pan-verloc.png" data-click-listener-attached="true">pan Verloc</span>, wyłaniając';
      const expected =
        'stawał <span class="current-word" data-highlight-generated="true"><span class="character-highlighted character-highlighted-activated" data-character="Pan-Verloc" data-src-listening="/Conrad-Tajny-Agent/pan-verloc.png" data-click-listener-attached="true">pan Verloc</span></span>, wyłaniając';
      const result = highlightNthOccurrence(html, "Verloc", 0, DEFAULT_CLASS);
      expect(result).toBe(expected);
    });

    test("should create specific inner span for word directly in a SPAN tag with additional word that it's looking", () => {
      const currentWordSpan = (innerElement: string) => `<span class="current-word" data-highlight-generated="true">${innerElement}</span>`;
      const paniVerlocHtml =
        '<span class="character-highlighted character-highlighted-activated" data-character="Winnie-Verloc" data-src-listening="/Conrad-Tajny-Agent/winnie-verloc.png" data-click-listener-attached="true">pani Verloc</span>';
      const winniVerlocHtml = '<span class="character-highlighted" data-character="Winnie-Verloc" data-src-listening="/Conrad-Tajny-Agent/winnie-verloc.png">Winnie Verloc</span>';

      const html = `czasem na wezwanie pękniętego dzwonka ukazywałą się ${paniVerlocHtml}. ${winniVerlocHtml} była młodą kobietą`;
      const expected = `czasem na wezwanie pękniętego dzwonka ukazywałą się ${currentWordSpan(paniVerlocHtml)}. ${winniVerlocHtml} była młodą kobietą`;

      const result = highlightNthOccurrence(html, "pani", 0, DEFAULT_CLASS);
      expect(result).toBe(expected);
    });

    test("should create inner span if word's parent is B (not SPAN)", () => {
      const html = "<p>Some <b>bold text here</b> example.</p>";
      const expected = `<p>Some <b>bold <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>text</span> here</b> example.</p>`;
      const result = highlightNthOccurrence(html, "text", 0, DEFAULT_CLASS);
      expect(result).toBe(expected);
    });

    test("should create inner span for word if parent SPAN contains other elements", () => {
      // Current logic for wrapping parent SPAN checks parentElement.nodeName === 'SPAN'.
      // It doesn't check for "sole significant text child".
      // If text node "wordA" is child of span#s1, span#s1 is wrapped.
      const html = '<p><span id="s1">wordA <b>bold</b> wordB</span></p>';
      const expectedForWordA = `<p><span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}><span id="s1">wordA <b>bold</b> wordB</span></span></p>`;
      const resultWordA = highlightNthOccurrence(html, "wordA", 0, DEFAULT_CLASS);
      expect(resultWordA).toBe(expectedForWordA);

      // After cleanup, if we highlight "bold", its parent is <b>, not <span>. So "bold" gets inner span.
      const cleanedFromWordA = `<p><span id="s1">wordA <b>bold</b> wordB</span></p>`;
      const expectedForBold = `<p><span id="s1">wordA <b><span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>bold</span></b> wordB</span></p>`;
      const resultBold = highlightNthOccurrence(cleanedFromWordA, "bold", 0, DEFAULT_CLASS);
      expect(resultBold).toBe(expectedForBold);
    });
  });

  // --- isLastWordInParagraph Flag Tests ---
  describe("isLastWordInParagraph functionality", () => {
    test("should add fade class to generated inner span for last word in plain text", () => {
      const html = "<p>This is the very end.</p>";
      const expected = `<p>This is the very <span class="${DEFAULT_CLASS} ${FADE_CLASS}" ${GENERATED_MARKER_HTML}>end</span>.</p>`;
      const result = highlightNthOccurrence(html, "end", 0, DEFAULT_CLASS, true);
      expect(result).toBe(expected);
    });

    test("should add fade class to the outer wrapper span if last word is inside an existing SPAN", () => {
      const html = '<p>The story concludes with <span class="ending-phrase">The Final Word</span>.</p>';
      const expected = `<p>The story concludes with <span class="${DEFAULT_CLASS} ${FADE_CLASS}" ${GENERATED_MARKER_HTML}><span class="ending-phrase">The Final Word</span></span>.</p>`;
      const result = highlightNthOccurrence(html, "Word", 0, DEFAULT_CLASS, true); // "Word" is 1st (index 0)
      expect(result).toBe(expected);
    });
  });

  // --- Cleanup Logic Tests ---
  describe("Cleanup of highlights", () => {
    test("highlighting A then B (both generated spans), removes span from A, adds to B", () => {
      const html = "<p>wordOne wordTwo</p>";
      let result = highlightNthOccurrence(html, "wordOne", 0, DEFAULT_CLASS);
      expect(result).toBe(`<p><span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>wordOne</span> wordTwo</p>`);

      result = highlightNthOccurrence(result, "wordTwo", 0, DEFAULT_CLASS);
      expect(result).toBe(`<p>wordOne <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>wordTwo</span></p>`);
    });

    test("highlighting A in S1 (S1 wrapped), then B (plain), S1 wrapper removed, S1 preserved", () => {
      const html = '<p><span id="S1">wordA</span> wordB</p>';
      let result = highlightNthOccurrence(html, "wordA", 0, DEFAULT_CLASS); // Wraps S1
      expect(result).toBe(`<p><span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}><span id="S1">wordA</span></span> wordB</p>`);

      result = highlightNthOccurrence(result, "wordB", 0, DEFAULT_CLASS); // wordB gets its own span
      expect(result).toBe(`<p><span id="S1">wordA</span> <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>wordB</span></p>`);
    });

    test("fade class is correctly added and removed during cleanup cycle", () => {
      const html = "<p>Highlight last then next.</p>";
      // Highlight "last" as the last word (gets fade class)
      let result = highlightNthOccurrence(html, "last", 0, DEFAULT_CLASS, true);
      expect(result).toBe(`<p>Highlight <span class="${DEFAULT_CLASS} ${FADE_CLASS}" ${GENERATED_MARKER_HTML}>last</span> then next.</p>`);

      // Highlight "next" (not last). Previous highlight (and its fade class) should be gone.
      result = highlightNthOccurrence(result, "next", 0, DEFAULT_CLASS, false);
      expect(result).toBe(`<p>Highlight last then <span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>next</span>.</p>`);
    });
  });

  // --- Edge Cases ---
  test("should return original HTML for empty wordToFind", () => {
    const html = "<p>Some text.</p>";
    expect(highlightNthOccurrence(html, "", 0, DEFAULT_CLASS)).toBe(html);
  });

  test("should return original HTML for empty htmlText", () => {
    expect(highlightNthOccurrence("", "word", 0, DEFAULT_CLASS)).toBe("");
  });

  test("should not highlight if occurrenceIndex is out of bounds", () => {
    const html = "<p>word word</p>"; // "word" appears twice (indices 0, 1)
    expect(highlightNthOccurrence(html, "word", 2, DEFAULT_CLASS)).toBe(html);
  });

  test("should handle HTML entities correctly (wordToFind has entities)", () => {
    const html = "<p>Smith &amp; Jones.</p>";
    const wordToFind = "Smith &amp; Jones"; // wordToFind contains the entity
    const expected = `<p><span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>Smith &amp; Jones</span>.</p>`;
    expect(highlightNthOccurrence(html, wordToFind, 0, DEFAULT_CLASS)).toBe(expected);
  });

  test("should handle HTML entities correctly (wordToFind is plain, text has entities)", () => {
    const html = "<p>Smith &amp; Jones.</p>"; // DOM text node is "Smith & Jones"
    const wordToFind = "Smith & Jones"; // Plain text word
    // Expecting the highlighted span to contain the entity form when re-serialized
    const expected = `<p><span class="${DEFAULT_CLASS}" ${GENERATED_MARKER_HTML}>Smith &amp; Jones</span>.</p>`;
    expect(highlightNthOccurrence(html, wordToFind, 0, DEFAULT_CLASS)).toBe(expected);
  });
});
