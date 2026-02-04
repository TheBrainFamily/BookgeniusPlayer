import { describe, it, expect } from "vitest";
import { buildParagraphXml, type Paragraph } from "./chapterChunker";

describe("buildParagraphXml", () => {
  it("renders attributes and escapes quotes inside attribute values", () => {
    const paragraph: Paragraph = {
      elementType: "p",
      dataIndex: 1,
      text: "Hello world",
      attributes: { "data-title": 'A "quoted" title' },
    };

    const output = buildParagraphXml(paragraph);

    expect(output).toBe('<p data-title="A &quot;quoted&quot; title">Hello world</p>');
  });

  it("preserves inner HTML tags in the paragraph text", () => {
    const paragraph: Paragraph = {
      elementType: "p",
      dataIndex: 2,
      text: 'Hello <span data-c="mary-cavendish">Mary</span>.',
    };

    const output = buildParagraphXml(paragraph);

    expect(output).toContain("<span data-c=");
    expect(output).toContain(">Mary</span>");
  });

  it("keeps double-quoted attributes inside embedded HTML", () => {
    const paragraph: Paragraph = {
      elementType: "figure",
      dataIndex: 3,
      text: '<img alt="Mrs. Inglethorp\'s bedroom" src="/figures/mrs.svg" />',
    };

    const output = buildParagraphXml(paragraph);

    expect(output).toContain('alt="Mrs. Inglethorp\'s bedroom"');
  });
});
