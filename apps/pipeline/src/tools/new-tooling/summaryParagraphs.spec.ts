import { describe, it, expect } from "vitest";
import { buildParagraphsForSummary } from "./summaryParagraphs";

describe("buildParagraphsForSummary", () => {
  it("wraps each paragraph in a <p> with the data index", () => {
    const output = buildParagraphsForSummary([
      { dataIndex: 0, text: "Hello world" },
      { dataIndex: 1, text: "Second paragraph" },
    ]);

    expect(output).toBe('<p id="0">Hello world</p>\n<p id="1">Second paragraph</p>');
  });

  it("preserves double quotes in text content", () => {
    const output = buildParagraphsForSummary([{ dataIndex: 2, text: 'He said "hello" and left.' }]);

    expect(output).toContain('He said "hello" and left.');
  });

  it("keeps embedded HTML attributes double-quoted", () => {
    const output = buildParagraphsForSummary([
      { dataIndex: 3, text: '<img alt="Mrs. Inglethorp\'s bedroom" src="/figures/mrs.svg" />' },
    ]);

    expect(output).toContain('alt="Mrs. Inglethorp\'s bedroom"');
  });
});
