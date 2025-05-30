import { TextEditor } from "./text-editor";
import { BOOK_SLUGS } from "@/consts";

const MOCK_BOOK_SLUG = "MOCK_BOOK" as BOOK_SLUGS;

describe("TextEditor", () => {
  describe("getParagraphByNumber", () => {
    let textEditor: TextEditor;

    beforeEach(() => {
      textEditor = new TextEditor(MOCK_BOOK_SLUG, "test");
    });

    it("should return first paragraph from first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 0);
      expect(result).toBe("Chapter Title");
    });

    it("should return paragraph with character tag from first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 1);
      expect(result).toBe("First paragraph with <John>John</John> character");
    });

    it("should return first paragraph from second chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 0);
      expect(result).toBe("Chapter 2");
    });

    it("should return null for non-existent chapter", () => {
      const result = textEditor.getParagraphByNumber(4, 0);
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
      expect(textEditor.getParagraphByNumber(1, 0)).toBe("Chapter Title");
      expect(textEditor.getParagraphByNumber(1, 1)).toBe("First paragraph with <John>John</John> character");
      expect(textEditor.getParagraphByNumber(1, 2)).toBe("A quote with <em>emphasis</em>");
      expect(textEditor.getParagraphByNumber(1, 3)).toBe("Second paragraph");
    });

    it("should return the last paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 3);
      expect(result).toBe("Second paragraph");
    });

    it("should return the last paragraph from the last chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 2);
      expect(result).toBe("Fourth paragraph");
    });

    it("should return a middle paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 2);
      expect(result).toBe("A quote with <em>emphasis</em>");
    });

    it("should return a middle paragraph from the last chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 1);
      expect(result).toBe("Third paragraph");
    });

    it("should return a blockquote from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 2);
      expect(result).toBe("A quote with <em>emphasis</em>");
    });

    it("should return the second paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 1);
      expect(result).toBe("First paragraph with <John>John</John> character");
    });

    it("should return the third paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 2);
      expect(result).toBe("A quote with <em>emphasis</em>");
    });

    it("should return the first paragraph from the second chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 0);
      expect(result).toBe("Chapter 2");
    });

    it("should return the second paragraph from the second chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 1);
      expect(result).toBe("Third paragraph");
    });

    it("should return the third paragraph from the second chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 2);
      expect(result).toBe("Fourth paragraph");
    });
  });

  describe("addCharacter", () => {
    let textEditor: TextEditor;
    beforeEach(() => {
      textEditor = new TextEditor(MOCK_BOOK_SLUG, "test");
    });

    it("should add character tag to a word in the paragraph", () => {
      const result = textEditor.addCharacter(1, 0, "John", "John", 3, 3);
      expect(result).toContain("<John>John</John>");
    });

    it("should throw error for non-existent paragraph", () => {
      expect(() => textEditor.addCharacter(1, 5, "John", "John", 3, 3)).toThrow("Paragraph not found");
    });
  });

  describe("removeCharacter", () => {
    let textEditor: TextEditor;

    beforeEach(() => {
      textEditor = new TextEditor(MOCK_BOOK_SLUG, "test");
    });

    it("should remove a character tag while preserving its content", () => {
      const result = textEditor.removeCharacter(1, 1, "John");
      expect(result).toContain("First paragraph with John character");
    });

    it("should throw an error when paragraph is not found", () => {
      expect(() => textEditor.removeCharacter(999, 0, "John")).toThrow("Paragraph not found");
    });

    it("should throw an error when character tag removal fails", () => {
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
      const firstResult = textEditor.removeCharacter(3, 1, "John", 2);
      expect(firstResult).toContain("Paragraph with multiple <John>first John</John>, and second");
      const secondResult = textEditor.removeCharacter(3, 1, "John", 1);
      expect(secondResult).toContain("Paragraph with multiple first John, and second");
    });
  });
});
