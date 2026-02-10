import { afterEach, describe, expect, it, vi } from "vitest";
import { getBookData } from "../shared-books-data/getBooksData";
import { getMtimeMs } from "./get-mtime-ms";
import { getFilePath } from "../helpers/filesHelpers";
import { getChapterParagraphsAndSectionAttributes } from "./createParagraphsWithPageNumbers";

vi.mock("../shared-books-data/getBooksData", () => ({ getBookData: vi.fn() }));
vi.mock("./get-mtime-ms", () => ({ getMtimeMs: vi.fn() }));
vi.mock("../helpers/filesHelpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../helpers/filesHelpers")>();
  return { ...actual, getFilePath: vi.fn() };
});

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

describe("getChapterParagraphsAndSectionAttributes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses getFilePath (not readBookFile) to resolve the rich.xml path", () => {
    asMock(getFilePath).mockReturnValue("/fake/book/input/rich.xml");
    asMock(getMtimeMs).mockReturnValue(1);
    asMock(getBookData).mockReturnValue({
      bookText: `<section data-chapter="1"><p>Hello world</p></section>`,
      chapters: "",
    });

    const { paragraphs } = getChapterParagraphsAndSectionAttributes(1);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text).toBe("Hello world");
    // The critical assertion: getFilePath must be called to build the path,
    // NOT readBookFile (which would return file contents instead of a path).
    expect(getFilePath).toHaveBeenCalledWith("rich.xml", "input");
  });
});
