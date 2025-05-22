import { TextEditor } from "./text-editor";
import { BOOK_SLUGS } from "@/consts";
import fs from "fs";

describe("TextEditor", () => {
  const mockXml = `<?xml version="1.0" encoding="UTF-8" ?>
<ebook>
    <Chapter id="1">
        <h3>Chapter 1</h3>
        <p>First paragraph</p>
        <p>Second paragraph with <Zlosliwy-czarodziej>character</Zlosliwy-czarodziej></p>
        <blockquote>Quote</blockquote>
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
      textEditor = new TextEditor(BOOK_SLUGS.Krolowa_Sniegu);
    });

    it("should return first paragraph from first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 0);
      expect(result).toBe("<h3>Chapter 1</h3>");
    });

    it("should return paragraph with character tag from first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 1);
      expect(result).toBe("<p>First paragraph</p>");
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
      const nestedXml = `<?xml version="1.0" encoding="UTF-8" ?>
<ebook>
    <Chapter id="1">
        <h3>Chapter Title</h3>
        <p>First paragraph with <John>John</John> character</p>
        <blockquote>A quote with <em>emphasis</em></blockquote>
        <p>Second paragraph</p>
    </Chapter>
</ebook>`;
      jest.spyOn(fs, "readFileSync").mockReturnValue(nestedXml);
      const textEditor = new TextEditor(BOOK_SLUGS.Krolowa_Sniegu);

      expect(textEditor.getParagraphByNumber(1, 0)).toBe("<h3>Chapter Title</h3>");
      expect(textEditor.getParagraphByNumber(1, 1)).toBe("<p>First paragraph with <John>John</John> character</p>");
      expect(textEditor.getParagraphByNumber(1, 2)).toBe("<blockquote>A quote with <em>emphasis</em></blockquote>");
      expect(textEditor.getParagraphByNumber(1, 3)).toBe("<p>Second paragraph</p>");
    });

    it("should return the last paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 3);
      expect(result).toBe("<blockquote>Quote</blockquote>");
    });

    it("should return the last paragraph from the last chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 2);
      expect(result).toBe("<p>Fourth paragraph</p>");
    });

    it("should return a middle paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 2);
      expect(result).toBe("<p>Second paragraph with <Zlosliwy-czarodziej>character</Zlosliwy-czarodziej></p>");
    });

    it("should return a middle paragraph from the last chapter", () => {
      const result = textEditor.getParagraphByNumber(2, 1);
      expect(result).toBe("<p>Third paragraph</p>");
    });

    it("should return a blockquote from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 3);
      expect(result).toBe("<blockquote>Quote</blockquote>");
    });

    it("should return the second paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 1);
      expect(result).toBe("<p>First paragraph</p>");
    });

    it("should return the third paragraph from the first chapter", () => {
      const result = textEditor.getParagraphByNumber(1, 2);
      expect(result).toBe("<p>Second paragraph with <Zlosliwy-czarodziej>character</Zlosliwy-czarodziej></p>");
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
});
