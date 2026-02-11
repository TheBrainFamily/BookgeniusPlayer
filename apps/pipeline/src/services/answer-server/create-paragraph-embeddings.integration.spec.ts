import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScenesSummariesPerChapter } from "../../tools/new-tooling/get-chapter-by-chapter-with-paragraphs-json-summary";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import type { Document } from "./create-paragraph-embeddings-side-effects";

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

describe("generateEmbeddings integration (real paragraph extraction)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // eslint-disable-next-line vitest/no-disabled-tests
  it.skip("uses real chapter paragraph extraction with mocked getBookData/getMtimeMs/readBookFile", async () => {
    const { getBookForm } = await import("../../tools/getBookForm");
    const { getBookData } = await import("../../shared-books-data/getBooksData");
    const { readBookFile } = await import("../../helpers/readBookFile");
    const { writeBookFile } = await import("../../helpers/writeBookFile");
    const { getBookSettings } = await import("../../helpers/getBookSettings");
    const { getMtimeMs } = await import("../../tools/get-mtime-ms");
    const { computeBatchEmbeddingsThroughHTTP } =
      await import("./create-paragraph-embeddings-side-effects");
    const { generateEmbeddings } = await import("./create-paragraph-embeddings");

    asMock(getBookForm).mockReturnValue("book");
    asMock(getBookSettings).mockReturnValue({
      startFromChapter: 5,
      numberOfChaptersToProcess: 1,
      title: "Test Book",
      author: "Test Author",
      language: "en",
    });
    asMock(getMtimeMs).mockReturnValue(987654321);
    asMock(computeBatchEmbeddingsThroughHTTP).mockImplementation(async (documents: Document[]) =>
      documents.map((document, index) => ({ ...document, Embeddings: [index + 1] })),
    );

    const summaries = [
      makeChapterSummary(5, [
        { paragraphsSummary: "Diary summary", paragraphNumbers: [1, 2, 3], mainParagraphNumber: 2 },
        { paragraphsSummary: "Frame summary", paragraphNumbers: [0, 4], mainParagraphNumber: 4 },
      ]),
    ];

    const richXmlPath = "/virtual/book/input/rich.xml";
    const bookText = `
      <section data-chapter="5">
        <h2>Letter I</h2>
        <blockquote epub:type="z3998:diary">
          <header>
            <p>Lucy Westenra’s Diary.</p>
          </header>
          <blockquote epub:type="z3998:diary-entry">
            <p><i>12 September.</i>⁠—How good they all are to me. ...</p>
            <p>Other text</p>
          </blockquote>
        </blockquote>
        <p>Standalone tail</p>
      </section>
    `;

    asMock(getBookData).mockReturnValue({ bookText, chapters: "" });
    asMock(readBookFile).mockImplementation((fileName: string, fileType?: FILE_TYPE) => {
      if (fileName === "rich.xml" && fileType === FILE_TYPE.INPUT) {
        return richXmlPath;
      }
      if (fileName === "summaries-with-paragraphs.json" && fileType === FILE_TYPE.TEMPORARY) {
        return JSON.stringify(summaries);
      }
      throw new Error(`Unexpected readBookFile call: ${fileName} ${String(fileType)}`);
    });

    await generateEmbeddings(5, 5, { writeToFile: false, bookForm: "book" });

    expect(readBookFile).toHaveBeenCalledWith(
      "summaries-with-paragraphs.json",
      FILE_TYPE.TEMPORARY,
    );
    const richXmlReadWasObserved = asMock(readBookFile).mock.calls.some(
      ([fileName, fileType]) => fileName === "rich.xml" && fileType === FILE_TYPE.INPUT,
    );
    if (richXmlReadWasObserved) {
      expect(getMtimeMs).toHaveBeenCalledWith(richXmlPath);
    }
    expect(asMock(getBookData).mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(writeBookFile).not.toHaveBeenCalled();

    expect(computeBatchEmbeddingsThroughHTTP).toHaveBeenCalledTimes(1);
    expect(computeBatchEmbeddingsThroughHTTP).toHaveBeenCalledWith([
      {
        text: "<Summary>Diary summary</Summary> <Text>Lucy Westenra’s Diary.\n12 September.⁠—How good they all are to me. ...\nOther text</Text>",
        chapter: 5,
        paragraphNumber: 2,
      },
      {
        text: "<Summary>Frame summary</Summary> <Text>Letter I\nStandalone tail</Text>",
        chapter: 5,
        paragraphNumber: 4,
      },
      { text: "Diary summary", chapter: 5, paragraphNumber: 2 },
      { text: "Frame summary", chapter: 5, paragraphNumber: 4 },
    ]);
  });
});
