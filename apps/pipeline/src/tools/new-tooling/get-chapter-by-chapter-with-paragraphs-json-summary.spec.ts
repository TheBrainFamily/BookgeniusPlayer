import { beforeEach, describe, expect, it, vi } from "vitest";
import { turnChapterSummariesIntoBulletPointsMappedToParagraphs } from "./get-chapter-by-chapter-with-paragraphs-json-summary";
import { callGrokAzureWithSchema } from "../../callGrokAzure";
import { callGeminiWithThinkingAndSchemaAndParsed } from "../../callFastGemini";
import { convex } from "../../server/convex-client";

type UpsertPayload = {
  bookPath: string;
  characterSlug: string;
  chapterNumber: number;
  summary: string;
  isFirstAppearance: boolean;
};

type WriteCall = { fileName: string; content: string; fileType?: string };

const testState = vi.hoisted(() => {
  const rewrittenXmlByChapter = new Map<number, string>();
  const writes: WriteCall[] = [];
  const files = new Map<string, string>();
  const upserts: UpsertPayload[] = [];

  let chapterStart = 1;
  let chapterCount = 1;
  let referenceCardsJson = "";

  function reset() {
    rewrittenXmlByChapter.clear();
    writes.length = 0;
    files.clear();
    upserts.length = 0;
    chapterStart = 1;
    chapterCount = 1;
    referenceCardsJson = JSON.stringify({ characters: [] });
  }

  function setChapterRange(start: number, count: number) {
    chapterStart = start;
    chapterCount = count;
  }

  function setRewrittenXml(chapter: number, xml: string) {
    rewrittenXmlByChapter.set(chapter, xml);
  }

  function setReferenceCardsJson(json: string) {
    referenceCardsJson = json;
  }

  function read(fileName: string): string {
    if (fileName === "single-summary-per-person.json") {
      return referenceCardsJson;
    }

    const chapterMatch = fileName.match(/^rewritten-paragraphs-for-chapter-(\d+)\.xml$/);
    if (chapterMatch) {
      const chapter = Number.parseInt(chapterMatch[1], 10);
      const xml = rewrittenXmlByChapter.get(chapter);
      if (!xml) {
        throw new Error(`File not found: ${fileName}`);
      }
      return xml;
    }

    const content = files.get(fileName);
    if (content !== undefined) {
      return content;
    }

    throw new Error(`Unexpected read: ${fileName}`);
  }

  function write(fileName: string, content: string, fileType?: string) {
    writes.push({ fileName, content, fileType });
    files.set(fileName, content);
  }

  function getChapterFromPrompt(prompt: string): number {
    const match = prompt.match(/chapter-(\d+)-paragraph/);
    if (!match) {
      throw new Error(`Unable to infer chapter from prompt: ${prompt.slice(0, 200)}`);
    }
    return Number.parseInt(match[1], 10);
  }

  return {
    rewrittenXmlByChapter,
    writes,
    files,
    upserts,
    reset,
    setChapterRange,
    setRewrittenXml,
    setReferenceCardsJson,
    read,
    write,
    getChapterFromPrompt,
    get chapterStart() {
      return chapterStart;
    },
    get chapterCount() {
      return chapterCount;
    },
  };
});

vi.mock("../../helpers/getBookSettings", () => ({
  getBookSettings: vi.fn(() => ({
    startFromChapter: testState.chapterStart,
    numberOfChaptersToProcess: testState.chapterCount,
    title: "Test Book",
    author: "Author",
  })),
}));

vi.mock("../createParagraphsWithPageNumbers", () => ({
  getParagraphsFromChapter: vi.fn((chapterNum: number) => [
    { text: `chapter-${chapterNum}-paragraph-1`, dataIndex: 1 },
    { text: `chapter-${chapterNum}-paragraph-2`, dataIndex: 2 },
  ]),
}));

vi.mock("./summaryParagraphs", () => ({
  buildParagraphsForSummary: vi.fn((paragraphs: Array<{ text: string; dataIndex: number }>) =>
    paragraphs.map((p) => `<p id="${p.dataIndex}">${p.text}</p>`).join("\n"),
  ),
}));

vi.mock("../../helpers/readBookFile", () => ({
  readBookFile: vi.fn((fileName: string) => testState.read(fileName)),
}));

vi.mock("../../helpers/writeBookFile", () => ({
  writeBookFile: vi.fn((fileName: string, content: string, fileType?: string) =>
    testState.write(fileName, content, fileType),
  ),
}));

vi.mock("../../helpers/getCurrentBook", () => ({
  getCurrentBook: vi.fn(() => "books-data/test-book"),
}));

vi.mock("../../callGrokAzure", () => ({ callGrokAzureWithSchema: vi.fn() }));

vi.mock("../../callFastGemini", () => ({ callGeminiWithThinkingAndSchemaAndParsed: vi.fn() }));

vi.mock("../../server/convex-client", () => ({
  convex: {
    upsertCharacterChapterSummary: vi.fn(async (args: UpsertPayload) => {
      testState.upserts.push(args);
      return { summaryId: "summary-id" };
    }),
  },
}));

function baseSummary(chapterNum: number) {
  return {
    chapterSummary: {
      contextSummary: `context-${chapterNum}`,
      chapterBulletPoints: [
        { paragraphsSummary: `event-${chapterNum}`, paragraphNumbers: [1], mainParagraphNumber: 1 },
      ],
    },
  };
}

describe("turnChapterSummariesIntoBulletPointsMappedToParagraphs", () => {
  beforeEach(() => {
    testState.reset();
    vi.clearAllMocks();

    testState.setReferenceCardsJson(
      JSON.stringify({
        characters: [
          { name: "Alice", referenceCard: "Alice card", visualGuide: "Alice visual" },
          { name: "Bob", referenceCard: "Bob card", visualGuide: "Bob visual" },
          { name: "Carol", referenceCard: "Carol card", visualGuide: "Carol visual" },
        ],
      }),
    );

    vi.mocked(callGrokAzureWithSchema).mockImplementation(async (prompt: string) => {
      const chapterNum = testState.getChapterFromPrompt(prompt);
      return {
        ...baseSummary(chapterNum),
        chapterSummary: {
          ...baseSummary(chapterNum).chapterSummary,
          characterActions: [{ slug: "alice", chapterAction: `alice-action-${chapterNum}` }],
        },
      };
    });

    vi.mocked(callGeminiWithThinkingAndSchemaAndParsed).mockResolvedValue(baseSummary(1));
  });

  it("injects detected characters from rewritten XML and parses data-c + data-speaker", async () => {
    testState.setChapterRange(1, 1);
    testState.setRewrittenXml(
      1,
      `<section data-chapter="1">\n<p data-speaker="bob carol"><span data-c="alice">Alice</span> speaks.</p>\n<p><span data-c="bob">Bob</span> listens.</p>\n</section>`,
    );

    await turnChapterSummariesIntoBulletPointsMappedToParagraphs();

    const prompt = testState.files.get("prompt-summaries-with-paragraphs-1.txt") || "";
    expect(prompt).toContain('slug="alice"');
    expect(prompt).toContain('slug="bob"');
    expect(prompt).toContain('slug="carol"');
    expect(prompt).toContain('slug="carol" name="Carol" mentioned="false" speaking="true"');

    const chapterSummaryRaw = testState.files.get("summaries-with-paragraphs-1.json");
    expect(chapterSummaryRaw).toBeDefined();
    const chapterSummary = JSON.parse(chapterSummaryRaw || "{}");

    expect(chapterSummary.chapterCharacters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "alice", mentioned: true, speaking: false }),
        expect.objectContaining({ slug: "bob", mentioned: true, speaking: true }),
        expect.objectContaining({ slug: "carol", mentioned: false, speaking: true }),
      ]),
    );

    expect(testState.upserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ characterSlug: "alice", summary: "alice-action-1" }),
      ]),
    );
  });

  it("fails hard when rewritten chapter XML is missing", async () => {
    testState.setChapterRange(1, 2);
    testState.setRewrittenXml(
      1,
      `<section data-chapter="1"><p><span data-c="alice">Alice</span></p></section>`,
    );

    await expect(turnChapterSummariesIntoBulletPointsMappedToParagraphs()).rejects.toThrow(
      /rewritten-paragraphs-for-chapter-2\.xml/i,
    );

    expect(vi.mocked(callGrokAzureWithSchema)).not.toHaveBeenCalled();
  });

  it("computes isFirstAppearance in a two-pass way even with parallel chapter processing", async () => {
    testState.setChapterRange(1, 2);
    testState.setRewrittenXml(
      1,
      `<section data-chapter="1"><p><span data-c="bob">Bob</span></p></section>`,
    );
    testState.setRewrittenXml(
      2,
      `<section data-chapter="2"><p><span data-c="bob">Bob</span></p></section>`,
    );

    vi.mocked(callGrokAzureWithSchema).mockImplementation(async (prompt: string) => {
      const chapterNum = testState.getChapterFromPrompt(prompt);
      if (chapterNum === 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return {
        ...baseSummary(chapterNum),
        chapterSummary: {
          ...baseSummary(chapterNum).chapterSummary,
          characterActions: [{ slug: "bob", chapterAction: `bob-action-${chapterNum}` }],
        },
      };
    });

    await turnChapterSummariesIntoBulletPointsMappedToParagraphs();

    const bobChapter1 = testState.upserts.find(
      (entry) => entry.characterSlug === "bob" && entry.chapterNumber === 1,
    );
    const bobChapter2 = testState.upserts.find(
      (entry) => entry.characterSlug === "bob" && entry.chapterNumber === 2,
    );

    expect(bobChapter1?.isFirstAppearance).toBe(true);
    expect(bobChapter2?.isFirstAppearance).toBe(false);
  });

  it("keeps and upserts LLM extra slugs not detected in XML with safe defaults", async () => {
    testState.setChapterRange(1, 1);
    testState.setRewrittenXml(
      1,
      `<section data-chapter="1"><p><span data-c="alice">Alice</span></p></section>`,
    );

    vi.mocked(callGrokAzureWithSchema).mockResolvedValue({
      ...baseSummary(1),
      chapterSummary: {
        ...baseSummary(1).chapterSummary,
        characterActions: [
          { slug: "alice", chapterAction: "alice-action" },
          { slug: "mystery-person", chapterAction: "mystery-action" },
        ],
      },
    });

    await turnChapterSummariesIntoBulletPointsMappedToParagraphs();

    const chapterSummary = JSON.parse(
      testState.files.get("summaries-with-paragraphs-1.json") || "{}",
    );
    expect(chapterSummary.chapterCharacters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "mystery-person",
          mentioned: true,
          speaking: false,
          chapterAction: "mystery-action",
        }),
      ]),
    );

    expect(testState.upserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ characterSlug: "mystery-person", summary: "mystery-action" }),
      ]),
    );

    const aggregate = JSON.parse(testState.files.get("summaries-with-paragraphs.json") || "[]");
    expect(aggregate[0].chapterCharacters).toBeDefined();
  });

  it("derives Convex bookPath from current book selection", async () => {
    testState.setChapterRange(1, 1);
    testState.setRewrittenXml(
      1,
      `<section data-chapter="1"><p><span data-c="alice">Alice</span></p></section>`,
    );

    await turnChapterSummariesIntoBulletPointsMappedToParagraphs();

    expect(testState.upserts[0]?.bookPath).toBe("books/test-book");
    expect(vi.mocked(convex.upsertCharacterChapterSummary)).toHaveBeenCalled();
  });
});
