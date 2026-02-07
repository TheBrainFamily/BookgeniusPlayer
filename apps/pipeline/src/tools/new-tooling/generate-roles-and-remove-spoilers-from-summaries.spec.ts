import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateRolesAndRemoveSpoilersFromSummaries } from "./generate-roles-and-remove-spoilers-from-summaries";
import { callGeminiWithThinkingAndSchemaAndParsed } from "../../callFastGemini";
import { callGpt5WithSchema } from "../../callGpt5";

type WriteCall = { fileName: string; content: string; fileType?: string };

const state = vi.hoisted(() => {
  const writes: WriteCall[] = [];
  const files = new Map<string, string>();

  function reset(): void {
    writes.length = 0;
    files.clear();
  }

  function write(fileName: string, content: string, fileType?: string): void {
    writes.push({ fileName, content, fileType });
    files.set(fileName, content);
  }

  return { writes, files, reset, write };
});

const inputReferenceCards = {
  characters: [
    { name: "Alice", referenceCard: "Original Alice", visualGuide: "Alice visual" },
    { name: "Bob", referenceCard: "Original Bob", visualGuide: "Bob visual" },
  ],
};

vi.mock("fs", () => ({ default: { readFileSync: vi.fn(() => "PROMPT TEMPLATE") } }));

vi.mock("../../helpers/readBookFile", () => ({
  readBookFile: vi.fn(() => JSON.stringify(inputReferenceCards)),
}));

vi.mock("../../helpers/writeBookFile", () => ({
  writeBookFile: vi.fn((fileName: string, content: string, fileType?: string) => {
    state.write(fileName, content, fileType);
  }),
}));

vi.mock("../../callFastGemini", () => ({ callGeminiWithThinkingAndSchemaAndParsed: vi.fn() }));

vi.mock("../../callGpt5", () => ({ callGpt5WithSchema: vi.fn() }));

function cleanedBy(provider: string) {
  return {
    characters: [
      { name: "Alice", referenceCard: `Clean Alice (${provider})`, role: "Main Hero" },
      { name: "Bob", referenceCard: `Clean Bob (${provider})`, role: null },
    ],
  };
}

describe("generateRolesAndRemoveSpoilersFromSummaries", () => {
  beforeEach(() => {
    state.reset();
    vi.clearAllMocks();

    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback: TimerHandler) => {
      if (typeof callback === "function") {
        callback();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
  });

  it("uses Gemini API first and writes normalized output", async () => {
    vi.mocked(callGeminiWithThinkingAndSchemaAndParsed).mockResolvedValue(cleanedBy("gemini-api"));

    const result = await generateRolesAndRemoveSpoilersFromSummaries();

    expect(result.characters.map((character) => character.name)).toEqual(["Alice", "Bob"]);
    expect(result.characters[0].referenceCard).toBe("Clean Alice (gemini-api)");
    expect(result.characters[0].role).toBe("Main Hero");
    expect(callGeminiWithThinkingAndSchemaAndParsed).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      "gemini-3-flash-preview",
      { preferVertex: false },
    );
    expect(callGpt5WithSchema).not.toHaveBeenCalled();
    expect(state.files.has("single-summary-per-person-roles.json")).toBe(true);
    expect(state.files.has("generate-roles-and-remove-spoilers-from-summaries-prompt.md")).toBe(
      true,
    );
  });

  it("retries retryable Gemini API errors before succeeding", async () => {
    vi.mocked(callGeminiWithThinkingAndSchemaAndParsed)
      .mockRejectedValueOnce({ statusCode: 429, message: "rate limit exceeded" })
      .mockResolvedValueOnce(cleanedBy("gemini-api"));

    const result = await generateRolesAndRemoveSpoilersFromSummaries();

    expect(result.characters[0].referenceCard).toBe("Clean Alice (gemini-api)");
    expect(callGeminiWithThinkingAndSchemaAndParsed).toHaveBeenCalledTimes(2);
    expect(callGpt5WithSchema).not.toHaveBeenCalled();
  });

  it("falls back to Vertex and then GPT-5 if earlier providers fail", async () => {
    vi.mocked(callGeminiWithThinkingAndSchemaAndParsed)
      .mockRejectedValueOnce(new Error("bad request"))
      .mockRejectedValueOnce(new Error("vertex unavailable"));
    vi.mocked(callGpt5WithSchema).mockResolvedValue(cleanedBy("gpt-5"));

    const result = await generateRolesAndRemoveSpoilersFromSummaries();

    expect(result.characters[0].referenceCard).toBe("Clean Alice (gpt-5)");
    expect(callGeminiWithThinkingAndSchemaAndParsed).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.anything(),
      "gemini-3-flash-preview",
      { preferVertex: false },
    );
    expect(callGeminiWithThinkingAndSchemaAndParsed).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.anything(),
      "gemini-3-flash-preview",
      { preferVertex: true },
    );
    expect(callGpt5WithSchema).toHaveBeenCalledTimes(1);
  });

  it("falls back when provider response misses required characters", async () => {
    vi.mocked(callGeminiWithThinkingAndSchemaAndParsed).mockResolvedValue({
      characters: [{ name: "Alice", referenceCard: "Only one", role: "Lead" }],
    });
    vi.mocked(callGpt5WithSchema).mockResolvedValue(cleanedBy("gpt-5"));

    const result = await generateRolesAndRemoveSpoilersFromSummaries();

    expect(result.characters).toHaveLength(2);
    expect(result.characters[1].name).toBe("Bob");
    expect(result.characters[1].referenceCard).toBe("Clean Bob (gpt-5)");
  });

  it("throws when Gemini API, Vertex, and GPT-5 all fail", async () => {
    vi.mocked(callGeminiWithThinkingAndSchemaAndParsed).mockRejectedValue(new Error("gemini down"));
    vi.mocked(callGpt5WithSchema).mockRejectedValue(new Error("gpt down"));

    await expect(generateRolesAndRemoveSpoilersFromSummaries()).rejects.toThrow(
      /failed to generate spoiler-cleaned summaries and roles/i,
    );
  });
});
