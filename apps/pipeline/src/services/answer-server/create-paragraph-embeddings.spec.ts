import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScenesSummariesPerChapter } from "../../tools/new-tooling/get-chapter-by-chapter-with-paragraphs-json-summary";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { getBookForm } from "../../tools/getBookForm";
import { getBookData } from "../../shared-books-data/getBooksData";
import { readBookFile } from "../../helpers/readBookFile";
import { writeBookFile } from "../../helpers/writeBookFile";
import { getBookSettings } from "../../helpers/getBookSettings";
import { getMtimeMs } from "../../tools/get-mtime-ms";
import {
  computeBatchEmbeddingsThroughHTTP,
  type Document,
} from "./create-paragraph-embeddings-side-effects";
import { generateEmbeddings } from "./create-paragraph-embeddings";

vi.mock("../../tools/getBookForm", () => ({ getBookForm: vi.fn() }));

vi.mock("../../shared-books-data/getBooksData", () => ({ getBookData: vi.fn() }));

vi.mock("../../helpers/readBookFile", () => ({ readBookFile: vi.fn() }));

vi.mock("../../helpers/writeBookFile", () => ({ writeBookFile: vi.fn() }));

vi.mock("../../helpers/getBookSettings", () => ({ getBookSettings: vi.fn() }));

vi.mock("../../tools/get-mtime-ms", () => ({ getMtimeMs: vi.fn() }));

vi.mock("./create-paragraph-embeddings-side-effects", () => ({
  computeBatchEmbeddingsThroughHTTP: vi.fn(),
}));

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function makeChapterSummary(
  chapterNumber: number,
  bulletPoints: Array<{
    paragraphsSummary: string;
    paragraphNumbers: number[];
    mainParagraphNumber: number;
  }>,
): ScenesSummariesPerChapter {
  return {
    chapterSummary: {
      chapterNumber,
      contextSummary: `context-${chapterNumber}`,
      chapterBulletPoints: bulletPoints,
      characterActions: [],
    },
    chapterCharacters: [],
  };
}

describe("generateEmbeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    asMock(getBookForm).mockReturnValue("book");
    asMock(getBookData).mockReturnValue({
      bookText: `<section data-chapter="1"><p>fallback text</p></section>`,
      chapters: "",
    });
    asMock(getBookSettings).mockReturnValue({
      startFromChapter: 1,
      numberOfChaptersToProcess: 1,
      title: "Test Book",
      author: "Test Author",
      language: "en",
    });
    asMock(getMtimeMs).mockReturnValue(12345);

    asMock(computeBatchEmbeddingsThroughHTTP).mockImplementation(async (documents: Document[]) =>
      documents.map((document, index) => ({ ...document, Embeddings: [index + 1] })),
    );
  });

  it("builds exact embedding payload shape from provided summaries and book text", async () => {
    const summaries = [
      makeChapterSummary(1, [
        { paragraphsSummary: "Summary A", paragraphNumbers: [1, 2], mainParagraphNumber: 2 },
        { paragraphsSummary: "Summary B", paragraphNumbers: [0], mainParagraphNumber: 0 },
      ]),
    ];

    await generateEmbeddings(1, 1, {
      summaries,
      bookText: `
        <section data-chapter="1">
          <p>Zero</p>
          <p>One</p>
          <p>Two</p>
        </section>
      `,
      bookForm: "book",
      writeToFile: false,
    });

    expect(computeBatchEmbeddingsThroughHTTP).toHaveBeenCalledTimes(1);
    expect(computeBatchEmbeddingsThroughHTTP).toHaveBeenCalledWith([
      {
        text: "<Summary>Summary A</Summary> <Text>One\nTwo</Text>",
        chapter: 1,
        paragraphNumber: 2,
      },
      { text: "<Summary>Summary B</Summary> <Text>Zero</Text>", chapter: 1, paragraphNumber: 0 },
      { text: "Summary A", chapter: 1, paragraphNumber: 2 },
      { text: "Summary B", chapter: 1, paragraphNumber: 0 },
    ]);
  });

  it("uses getParagraphsFromChapterWithText when bookText is provided", async () => {
    const summaries = [
      makeChapterSummary(1, [
        { paragraphsSummary: "Summary", paragraphNumbers: [0], mainParagraphNumber: 0 },
      ]),
    ];

    await generateEmbeddings(1, 1, {
      summaries,
      bookText: "<section data-chapter='1'><p>Provided text</p></section>",
      writeToFile: false,
    });

    // When summaries + bookText are provided, the fallback file path should not be touched.
    expect(readBookFile).not.toHaveBeenCalled();
  });

  it("uses summaries file + getParagraphsFromChapter when options are omitted", async () => {
    const summaries = [
      makeChapterSummary(2, [
        { paragraphsSummary: "From file", paragraphNumbers: [0], mainParagraphNumber: 0 },
      ]),
    ];

    asMock(readBookFile).mockImplementation((fileName: string, fileType?: FILE_TYPE) => {
      if (fileName === "summaries-with-paragraphs.json" && fileType === FILE_TYPE.TEMPORARY) {
        return JSON.stringify(summaries);
      }
      if (fileName === "rich.xml" && fileType === FILE_TYPE.INPUT) {
        return "/virtual/book/input/rich.xml";
      }
      throw new Error(`Unexpected readBookFile call: ${fileName} ${String(fileType)}`);
    });
    asMock(getBookData).mockReturnValue({
      bookText: `<section data-chapter="2"><p>Chapter two text</p></section>`,
      chapters: "",
    });

    await generateEmbeddings(2, 2);

    expect(readBookFile).toHaveBeenCalledWith(
      "summaries-with-paragraphs.json",
      FILE_TYPE.TEMPORARY,
    );
    expect(readBookFile).toHaveBeenCalledWith("rich.xml", FILE_TYPE.INPUT);
    expect(writeBookFile).toHaveBeenCalledTimes(1);
  });

  it("writes embeddings.json in the serialized map entries shape by default", async () => {
    const summaries = [
      makeChapterSummary(1, [
        { paragraphsSummary: "Summary to write", paragraphNumbers: [0], mainParagraphNumber: 0 },
      ]),
    ];

    const result = await generateEmbeddings(1, 1, {
      summaries,
      bookText: `<section data-chapter="1"><p>Text to write</p></section>`,
      bookForm: "book",
    });

    expect(writeBookFile).toHaveBeenCalledWith(
      "embeddings.json",
      JSON.stringify(Array.from(result.entries()), null, 2),
    );
  });

  it("does not write embeddings.json when writeToFile is false", async () => {
    const summaries = [
      makeChapterSummary(1, [
        { paragraphsSummary: "No write summary", paragraphNumbers: [0], mainParagraphNumber: 0 },
      ]),
    ];

    await generateEmbeddings(1, 1, {
      summaries,
      bookText: `<section data-chapter="1"><p>No write text</p></section>`,
      bookForm: "book",
      writeToFile: false,
    });

    expect(writeBookFile).not.toHaveBeenCalled();
  });

  it("throws when a requested chapter is missing from summaries", async () => {
    const summaries = [
      makeChapterSummary(99, [
        { paragraphsSummary: "Wrong chapter", paragraphNumbers: [0], mainParagraphNumber: 0 },
      ]),
    ];

    await expect(
      generateEmbeddings(1, 1, {
        summaries,
        bookText: `<section data-chapter="1"><p>Some text</p></section>`,
        bookForm: "book",
        writeToFile: false,
      }),
    ).rejects.toThrow("Chapter 1 not found in summaries");
  });
});
