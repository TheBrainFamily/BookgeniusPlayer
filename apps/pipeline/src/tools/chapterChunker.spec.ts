import { describe, it, expect } from "vitest";
import {
  buildParagraphXml,
  buildChunkXml,
  chunkParagraphs,
  type Paragraph,
  type ContainerInfo,
} from "./chapterChunker";

// Helper to create a ContainerInfo
function container(
  id: string,
  tagName: string,
  attributes: Record<string, string> = {},
): ContainerInfo {
  return { id, tagName, attributes };
}

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

  it("renders void element <hr> as self-closing tag", () => {
    const paragraph: Paragraph = { elementType: "hr", dataIndex: 5, text: "" };
    expect(buildParagraphXml(paragraph)).toBe("<hr/>");
  });

  it("throws if a void element has its own markup as text", () => {
    const paragraph: Paragraph = { elementType: "hr", dataIndex: 5, text: "<hr>" };
    expect(() => buildParagraphXml(paragraph)).toThrowError(
      'Void element <hr> at data-index 5 has its own markup as text (cheerio serialization bug): "<hr>"',
    );
  });

  it("allows void elements with placeholder text", () => {
    const paragraph: Paragraph = { elementType: "hr", dataIndex: 5, text: "[Section break]" };
    expect(buildParagraphXml(paragraph)).toBe("<hr/>");
  });

  it("renders void element <img> with attributes as self-closing tag", () => {
    const paragraph: Paragraph = {
      elementType: "img",
      dataIndex: 6,
      text: "",
      attributes: { alt: "A portrait", src: "/img/portrait.jpg" },
    };
    expect(buildParagraphXml(paragraph)).toBe('<img alt="A portrait" src="/img/portrait.jpg"/>');
  });
});

describe("buildChunkXml — container reconstruction", () => {
  it("returns flat output when no paragraph has containers (unchanged behavior)", () => {
    const paragraphs: Paragraph[] = [
      { elementType: "h2", dataIndex: 0, text: "Chapter Title" },
      { elementType: "p", dataIndex: 1, text: "First paragraph." },
      { elementType: "p", dataIndex: 2, text: "Second paragraph." },
    ];

    const output = buildChunkXml(paragraphs);

    expect(output).toBe(
      "<h2>Chapter Title</h2>\n<p>First paragraph.</p>\n<p>Second paragraph.</p>",
    );
  });

  it("wraps paragraphs sharing a single container in open/close tags", () => {
    const bq = container("c0", "blockquote");
    const paragraphs: Paragraph[] = [
      { elementType: "p", dataIndex: 0, text: "Dear sister,", containers: [bq] },
      { elementType: "p", dataIndex: 1, text: "I write to you.", containers: [bq] },
    ];

    const output = buildChunkXml(paragraphs);

    expect(output).toBe(
      ["<blockquote>", "<p>Dear sister,</p>", "<p>I write to you.</p>", "</blockquote>"].join("\n"),
    );
  });

  it("reconstructs nested containers (blockquote > header, blockquote, blockquote > footer)", () => {
    const bq = container("c0", "blockquote");
    const hdr = container("c1", "header");
    const ftr = container("c2", "footer");
    const paragraphs: Paragraph[] = [
      { elementType: "p", dataIndex: 0, text: "To Mrs. Saville", containers: [bq, hdr] },
      { elementType: "p", dataIndex: 1, text: "My dear sister,", containers: [bq] },
      { elementType: "p", dataIndex: 2, text: "Yours, R. Walton", containers: [bq, ftr] },
    ];

    const output = buildChunkXml(paragraphs);

    expect(output).toBe(
      [
        "<blockquote>",
        "<header>",
        "<p>To Mrs. Saville</p>",
        "</header>",
        "<p>My dear sister,</p>",
        "<footer>",
        "<p>Yours, R. Walton</p>",
        "</footer>",
        "</blockquote>",
      ].join("\n"),
    );
  });

  it("handles mixed top-level leaves and contained leaves", () => {
    const bq = container("c0", "blockquote");
    const paragraphs: Paragraph[] = [
      { elementType: "h2", dataIndex: 0, text: "Letter III" },
      { elementType: "p", dataIndex: 1, text: "Dear sister,", containers: [bq] },
      { elementType: "p", dataIndex: 2, text: "I arrived safely.", containers: [bq] },
      { elementType: "p", dataIndex: 3, text: "End of chapter." },
    ];

    const output = buildChunkXml(paragraphs);

    expect(output).toBe(
      [
        "<h2>Letter III</h2>",
        "<blockquote>",
        "<p>Dear sister,</p>",
        "<p>I arrived safely.</p>",
        "</blockquote>",
        "<p>End of chapter.</p>",
      ].join("\n"),
    );
  });

  it("preserves container attributes (e.g. epub:type)", () => {
    const bq = container("c0", "blockquote", { "epub:type": "z3998:letter" });
    const paragraphs: Paragraph[] = [
      { elementType: "p", dataIndex: 0, text: "Dear friend,", containers: [bq] },
    ];

    const output = buildChunkXml(paragraphs);

    expect(output).toBe(
      ['<blockquote epub:type="z3998:letter">', "<p>Dear friend,</p>", "</blockquote>"].join("\n"),
    );
  });

  it("handles two separate containers in sequence", () => {
    const bq1 = container("c0", "blockquote");
    const bq2 = container("c1", "blockquote");
    const paragraphs: Paragraph[] = [
      { elementType: "p", dataIndex: 0, text: "First letter.", containers: [bq1] },
      { elementType: "p", dataIndex: 1, text: "Second letter.", containers: [bq2] },
    ];

    const output = buildChunkXml(paragraphs);

    expect(output).toBe(
      [
        "<blockquote>",
        "<p>First letter.</p>",
        "</blockquote>",
        "<blockquote>",
        "<p>Second letter.</p>",
        "</blockquote>",
      ].join("\n"),
    );
  });
});

describe("chunkParagraphs — container grouping", () => {
  it("keeps paragraphs sharing a root container in the same chunk even if exceeding token limit", () => {
    const bq = container("c0", "blockquote");
    // Each paragraph is ~5 tokens. With maxTokens=10, normally the 3rd would start a new chunk.
    // But since they share a root container, they must stay together.
    const paragraphs: Paragraph[] = [
      { elementType: "p", dataIndex: 0, text: "word word word word word", containers: [bq] },
      { elementType: "p", dataIndex: 1, text: "word word word word word", containers: [bq] },
      { elementType: "p", dataIndex: 2, text: "word word word word word", containers: [bq] },
    ];

    const chunks = chunkParagraphs(paragraphs, 10);

    // All 3 paragraphs should be in a single chunk despite exceeding the limit
    expect(chunks).toHaveLength(1);
    expect(chunks[0].paragraphs).toHaveLength(3);
  });

  it("splits top-level paragraphs without containers normally (unchanged behavior)", () => {
    const paragraphs: Paragraph[] = [
      { elementType: "p", dataIndex: 0, text: "word word word word word" },
      { elementType: "p", dataIndex: 1, text: "word word word word word" },
      { elementType: "p", dataIndex: 2, text: "word word word word word" },
    ];

    const chunks = chunkParagraphs(paragraphs, 10);

    // Each top-level paragraph is its own group, so they split across chunks
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("puts a container group and a following top-level paragraph in separate chunks when limit exceeded", () => {
    const bq = container("c0", "blockquote");
    const paragraphs: Paragraph[] = [
      { elementType: "p", dataIndex: 0, text: "word word word word word", containers: [bq] },
      { elementType: "p", dataIndex: 1, text: "word word word word word", containers: [bq] },
      { elementType: "p", dataIndex: 2, text: "A top-level paragraph after the blockquote." },
    ];

    const chunks = chunkParagraphs(paragraphs, 12);

    // The blockquote group (~10 tokens) goes in chunk 0, the top-level paragraph in chunk 1
    expect(chunks).toHaveLength(2);
    expect(chunks[0].paragraphs).toHaveLength(2);
    expect(chunks[0].paragraphs[0].containers).toBeDefined();
    expect(chunks[1].paragraphs).toHaveLength(1);
    expect(chunks[1].paragraphs[0].containers).toBeUndefined();
  });

  it("returns single chunk when total tokens are under limit", () => {
    const bq = container("c0", "blockquote");
    const paragraphs: Paragraph[] = [
      { elementType: "p", dataIndex: 0, text: "Hello", containers: [bq] },
      { elementType: "p", dataIndex: 1, text: "World" },
    ];

    const chunks = chunkParagraphs(paragraphs, 8000);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].paragraphs).toHaveLength(2);
  });
});
