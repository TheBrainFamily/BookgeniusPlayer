import { TextEditor } from "./text-editor";
import { BOOK_SLUGS } from "@/consts";
import fs from "fs";

// Mock book slug for testing
const MOCK_BOOK_SLUG = "MOCK_BOOK" as BOOK_SLUGS;

describe("TextEditor", () => {
  const mockXml = `<?xml version="1.0" encoding="UTF-8" ?>
<ebook>
    <Chapter id="1">
        <h3>Chapter Title</h3>
        <p>First paragraph with <John>John</John> character</p>
        <blockquote>A quote with <em>emphasis</em></blockquote>
        <p>Second paragraph</p>
    </Chapter>
    <Chapter id="2">
        <h3>Chapter 2</h3>
        <p>Third paragraph</p>
        <p>Fourth paragraph</p>
    </Chapter>
</ebook>`;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(fs, "readFileSync").mockReturnValue(mockXml);
  });

  describe("getParagraphByNumber", () => {
    let textEditor: TextEditor;

    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(fs, "readFileSync").mockReturnValue(mockXml);
      textEditor = new TextEditor(MOCK_BOOK_SLUG);
    });

    it("should return first paragraph from first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 0);
      expect(result).toBe("<h3>Chapter Title</h3>");
    });

    it("should return paragraph with character tag from first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 1);
      expect(result).toBe("<p>First paragraph with <John>John</John> character</p>");
    });

    it("should return first paragraph from second chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 0);
      expect(result).toBe("<h3>Chapter 2</h3>");
    });

    it("should return null for non-existent chapter", () => {
      const result = textEditor.getParagraphByNumber(3, 0);
      expect(result).toBeNull();
    });

    it("should return null for non-existent paragraph", () => {
      const result = textEditor.getParagraphByNumber(1, 4);
      expect(result).toBeNull();
    });

    it("should return null for negative chapter number", () => {
      const result = textEditor.getParagraphByNumber(-1, 0);
      expect(result).toBeNull();
    });

    it("should return null for negative paragraph number", () => {
      const result = textEditor.getParagraphByNumber(1, -1);
      expect(result).toBeNull();
    });

    it("should return null for zero chapter number", () => {
      const result = textEditor.getParagraphByNumber(0, 0);
      expect(result).toBeNull();
    });

    it("should treat nested tags as part of paragraph content", () => {
      expect(textEditor.getParagraphByNumber(1, 0)).toBe("<h3>Chapter Title</h3>");
      expect(textEditor.getParagraphByNumber(1, 1)).toBe("<p>First paragraph with <John>John</John> character</p>");
      expect(textEditor.getParagraphByNumber(1, 2)).toBe("<blockquote>A quote with <em>emphasis</em></blockquote>");
      expect(textEditor.getParagraphByNumber(1, 3)).toBe("<p>Second paragraph</p>");
    });

    it("should return the last paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 3);
      expect(result).toBe("<p>Second paragraph</p>");
    });

    it("should return the last paragraph from the last chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 2);
      expect(result).toBe("<p>Fourth paragraph</p>");
    });

    it("should return a middle paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 2);
      expect(result).toBe("<blockquote>A quote with <em>emphasis</em></blockquote>");
    });

    it("should return a middle paragraph from the last chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 1);
      expect(result).toBe("<p>Third paragraph</p>");
    });

    it("should return a blockquote from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 2);
      expect(result).toBe("<blockquote>A quote with <em>emphasis</em></blockquote>");
    });

    it("should return the second paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 1);
      expect(result).toBe("<p>First paragraph with <John>John</John> character</p>");
    });

    it("should return the third paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 2);
      expect(result).toBe("<blockquote>A quote with <em>emphasis</em></blockquote>");
    });

    it("should return the first paragraph from the second chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 0);
      expect(result).toBe("<h3>Chapter 2</h3>");
    });

    it("should return the second paragraph from the second chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 1);
      expect(result).toBe("<p>Third paragraph</p>");
    });

    it("should return the third paragraph from the second chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 2);
      expect(result).toBe("<p>Fourth paragraph</p>");
    });
  });

  describe("addCharacter", () => {
    let textEditor: TextEditor;
    beforeEach(() => {
      jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});
      textEditor = new TextEditor(MOCK_BOOK_SLUG);
    });

    it("should allow adding character tag to existing text", () => {
      jest.resetAllMocks();
      const originalXml = `<?xml version="1.0" encoding="UTF-8" ?>
<ebook>
    <Chapter id="1">
        <p>First paragraph with John character</p>
    </Chapter>
</ebook>`;
      jest.spyOn(fs, "readFileSync").mockReturnValue(originalXml);
      const updatedText = "<p>First paragraph with <John>John</John> character</p>";
      expect(() => textEditor.addCharacter(1, 0, updatedText)).toThrow("Updated paragraph text is too different from the original");
    });

    it("should reject completely different text", () => {
      jest.resetAllMocks();
      const originalXml = `<?xml version="1.0" encoding="UTF-8" ?>
<ebook>
    <Chapter id="1">
        <p>First paragraph with John character</p>
    </Chapter>
</ebook>`;
      jest.spyOn(fs, "readFileSync").mockReturnValue(originalXml);
      const updatedText = "<p>Reksio zjadł kanapkę</p>";
      expect(() => textEditor.addCharacter(1, 0, updatedText)).toThrow("Updated paragraph text is too different from the original");
    });

    it("should reject modified text with character tag", () => {
      jest.resetAllMocks();
      const originalXml = `<?xml version="1.0" encoding="UTF-8" ?>
<ebook>
    <Chapter id="1">
        <p>First paragraph with John character</p>
    </Chapter>
</ebook>`;
      jest.spyOn(fs, "readFileSync").mockReturnValue(originalXml);
      const updatedText = "<p>First paragraph with <John>John</John> and more text</p>";
      expect(() => textEditor.addCharacter(1, 0, updatedText)).toThrow("Updated paragraph text is too different from the original");
    });

    it("should throw error for non-existent paragraph", () => {
      jest.resetAllMocks();
      const originalXml = `<?xml version="1.0" encoding="UTF-8" ?>
<ebook>
    <Chapter id="1">
        <p>First paragraph with John character</p>
    </Chapter>
</ebook>`;
      jest.spyOn(fs, "readFileSync").mockReturnValue(originalXml);
      const updatedText = "<p>First paragraph with <John>John</John> character</p>";
      expect(() => textEditor.addCharacter(1, 5, updatedText)).toThrow("Paragraph not found");
    });
  });

  describe("removeCharacter", () => {
    let textEditor: TextEditor;

    beforeEach(() => {
      jest.spyOn(fs, "readFileSync").mockReturnValue(mockXml);
      jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});
      textEditor = new TextEditor(MOCK_BOOK_SLUG);
    });

    it("should remove a character tag while preserving its content", () => {
      const result = textEditor.removeCharacter(1, 1, "John");
      expect(result).toContain("First paragraph with John character");
      expect(result).not.toContain("<John>");
      expect(result).not.toContain("</John>");
    });

    it("should throw an error when paragraph is not found", () => {
      expect(() => textEditor.removeCharacter(999, 0, "John")).toThrow("Paragraph not found");
    });

    it("should throw an error when character tag removal fails", () => {
      // Mock a malformed paragraph with an unclosed tag that will cause the parser to throw
      jest.spyOn(fs, "readFileSync").mockReturnValue(`<?xml version="1.0" encoding="UTF-8" ?>
<ebook>
  <Chapter id="1">
    <p><John>John</p>
  </Chapter>
</ebook>`);

      expect(() => textEditor.removeCharacter(1, 0, "John")).toThrow();
    });

    it("should preserve the rest of the XML structure", () => {
      const result = textEditor.removeCharacter(1, 1, "John");
      expect(result).toContain('<?xml version="1.0" encoding="UTF-8" ?>');
      expect(result).toContain("<ebook>");
      expect(result).toContain('<Chapter id="1">');
      expect(result).toContain("</Chapter>");
      expect(result).toContain("</ebook>");
    });

    it("should remove the character tag based on it's occurrence", () => {
      const multipleTagsXml = `<?xml version="1.0" encoding="UTF-8" ?>
<ebook>
    <Chapter id="1">
        <p>Multiple characters: <John>first</John> and <John>second</John></p>
    </Chapter>
</ebook>`;
      jest.spyOn(fs, "readFileSync").mockReturnValue(multipleTagsXml);
      // Re-instantiate TextEditor to use the new XML
      textEditor = new TextEditor(MOCK_BOOK_SLUG);
      // Remove first occurrence
      const resultFirst = textEditor.removeCharacter(1, 0, "John", 1);
      expect(resultFirst).toContain("Multiple characters: first and <John>second</John>");
      // Remove second occurrence
      const resultSecond = textEditor.removeCharacter(1, 0, "John", 2);
      expect(resultSecond).toContain("Multiple characters: <John>first</John> and second");
      // Verify error for invalid occurrence
      expect(() => textEditor.removeCharacter(1, 0, "John", 3)).toThrow("Invalid occurrence number. There are 2 occurrences of John in this paragraph.");
    });
  });
});
