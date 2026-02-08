import { beforeEach, describe, expect, it, vi } from "vitest";

type WriteCall = { fileName: string; content: string; fileType?: string };

process.env.CONVEX_URL ||= "https://example.test";
process.env.AZURE_GPT_5_2_KEY ||= "test-key";
process.env.AZURE_OPENAI_ENDPOINT ||= "https://example.test";

vi.mock("./convex-client", () => ({
  getCharacterFolders: vi.fn(),
  updateCharacterFolder: vi.fn(),
}));

async function runRetro(params: { slug: string; runId?: string; deps?: Record<string, unknown> }) {
  const mod = await import("./retroactive-character-role-cleanup");
  return await mod.runRetroactiveCharacterRoleCleanup(params);
}

describe("retroactive-character-role-cleanup", () => {
  const writes: WriteCall[] = [];
  const getCharacterFoldersFn = vi.fn();
  const updateCharacterFolderFn = vi.fn();
  const generateCleanupFn = vi.fn();
  const writeBookFileFn = vi.fn((fileName: string, content: string, fileType?: string) => {
    writes.push({ fileName, content, fileType });
  });
  const setCurrentBookFn = vi.fn();

  beforeEach(() => {
    writes.length = 0;
    getCharacterFoldersFn.mockReset();
    updateCharacterFolderFn.mockReset();
    generateCleanupFn.mockReset();
    writeBookFileFn.mockClear();
    setCurrentBookFn.mockClear();
  });

  it("writes backup first and updates characters one by one", async () => {
    getCharacterFoldersFn.mockResolvedValue([
      {
        path: "books/test-book/characters/victor-frankenstein",
        slug: "victor-frankenstein",
        displayName: "Victor Frankenstein",
        summary: "Original Victor",
        role: undefined,
      },
      {
        path: "books/test-book/characters/elizabeth-lavenza",
        slug: "elizabeth-lavenza",
        displayName: "Elizabeth Lavenza",
        summary: "Original Elizabeth",
        role: "Family",
      },
    ]);
    generateCleanupFn.mockResolvedValue({
      characters: [
        { slug: "victor-frankenstein", referenceCard: "Clean Victor", role: "Obsessed Scientist" },
        { slug: "elizabeth-lavenza", referenceCard: "Clean Elizabeth", role: "Adopted Companion" },
      ],
    });
    updateCharacterFolderFn.mockResolvedValue(undefined);

    const result = await runRetro({
      slug: "test-book",
      runId: "run-1",
      deps: {
        getCharacterFoldersFn,
        updateCharacterFolderFn,
        generateCleanupFn,
        writeBookFileFn,
        setCurrentBookFn,
      },
    });

    expect(setCurrentBookFn).toHaveBeenCalledWith("books-data/test-book");
    expect(writes[0]?.fileName).toContain("pre-update-character-metadata.json");
    expect(updateCharacterFolderFn).toHaveBeenCalledTimes(2);
    expect(result.summary.totalCharacters).toBe(2);
    expect(result.summary.failedUpdates).toBe(0);
  });

  it("continues on update errors and reports non-zero failures", async () => {
    getCharacterFoldersFn.mockResolvedValue([
      {
        path: "books/test-book/characters/victor-frankenstein",
        slug: "victor-frankenstein",
        displayName: "Victor Frankenstein",
        summary: "Original Victor",
      },
      {
        path: "books/test-book/characters/elizabeth-lavenza",
        slug: "elizabeth-lavenza",
        displayName: "Elizabeth Lavenza",
        summary: "Original Elizabeth",
      },
    ]);
    generateCleanupFn.mockResolvedValue({
      characters: [
        { slug: "victor-frankenstein", referenceCard: "Clean Victor", role: null },
        { slug: "elizabeth-lavenza", referenceCard: "Clean Elizabeth", role: null },
      ],
    });
    updateCharacterFolderFn.mockRejectedValueOnce(new Error("rate limit"));
    updateCharacterFolderFn.mockResolvedValueOnce(undefined);

    const result = await runRetro({
      slug: "test-book",
      runId: "run-2",
      deps: {
        getCharacterFoldersFn,
        updateCharacterFolderFn,
        generateCleanupFn,
        writeBookFileFn,
        setCurrentBookFn,
      },
    });

    expect(result.summary.failedUpdates).toBe(1);
    expect(result.summary.successfulUpdates).toBe(1);
    expect(result.results[0]?.status).toBe("error");
    expect(result.results[1]?.status).toBe("updated");
  });
});
