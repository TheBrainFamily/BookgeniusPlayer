import { beforeEach, describe, expect, it, vi } from "vitest";

type WriteCall = { fileName: string; content: string; fileType?: string };

process.env.AZURE_GPT_5_2_KEY ||= "test-key";
process.env.AZURE_OPENAI_ENDPOINT ||= "https://example.test";

const state = {
  writes: [] as WriteCall[],
  files: new Map<string, string>(),
  callGeminiMock: vi.fn(),
  callGpt5Mock: vi.fn(),
  readBookFileMock: vi.fn(),
  reset(): void {
    this.writes.length = 0;
    this.files.clear();
    this.callGeminiMock.mockReset();
    this.callGpt5Mock.mockReset();
    this.readBookFileMock.mockReset();
  },
  write(fileName: string, content: string, fileType?: string): void {
    this.writes.push({ fileName, content, fileType });
    this.files.set(fileName, content);
  },
};

const inputReferenceCards = {
  characters: [
    { name: "Alice", referenceCard: "Original Alice", visualGuide: "Alice visual" },
    { name: "Bob", referenceCard: "Original Bob", visualGuide: "Bob visual" },
  ],
};

vi.mock("fs", () => ({ default: { readFileSync: vi.fn(() => "PROMPT TEMPLATE") } }));

vi.mock("../../helpers/readBookFile", () => ({
  readBookFile: (...args: unknown[]) => state.readBookFileMock(...args),
}));

vi.mock("../../helpers/writeBookFile", () => ({
  writeBookFile: vi.fn((fileName: string, content: string, fileType?: string) => {
    state.write(fileName, content, fileType);
  }),
}));

vi.mock("../../callFastGemini", () => ({
  callGeminiWithThinkingAndSchemaAndParsed: (...args: unknown[]) => state.callGeminiMock(...args),
}));

vi.mock("../../callGpt5", () => ({
  callGpt5WithSchema: (...args: unknown[]) => state.callGpt5Mock(...args),
}));

function cleanedBy(provider: string) {
  return {
    characters: [
      { slug: "alice", referenceCard: `Clean Alice (${provider})`, role: "Main Hero" },
      { slug: "bob", referenceCard: `Clean Bob (${provider})`, role: null },
    ],
  };
}

async function generateWithOptions(options?: {
  inputCharacters?: { slug: string; name: string; referenceCard: string }[];
}) {
  const mod = await import("./generate-roles-and-remove-spoilers-from-summaries");
  return await mod.generateRolesAndRemoveSpoilersFromSummaries(options as any);
}

describe("generateRolesAndRemoveSpoilersFromSummaries", () => {
  beforeEach(() => {
    state.reset();
    state.readBookFileMock.mockReturnValue(JSON.stringify(inputReferenceCards));

    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback: TimerHandler) => {
      if (typeof callback === "function") {
        callback();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
  });

  it("uses Gemini API first and writes normalized slug-keyed output", async () => {
    state.callGeminiMock.mockResolvedValue(cleanedBy("gemini-api"));

    const result = await generateWithOptions();

    expect(result.characters.map((character) => character.slug)).toEqual(["alice", "bob"]);
    expect(result.characters[0].referenceCard).toBe("Clean Alice (gemini-api)");
    expect(result.characters[0].role).toBe("Main Hero");
    expect(state.callGeminiMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      "gemini-3-flash-preview",
      { preferVertex: false },
    );
    expect(state.callGpt5Mock).not.toHaveBeenCalled();
    expect(state.files.has("single-summary-per-person-roles.json")).toBe(true);
  });

  it("includes both slug and name in the cleanup prompt payload", async () => {
    state.callGeminiMock.mockResolvedValue(cleanedBy("gemini-api"));

    await generateWithOptions();

    const prompt = state.files.get("generate-roles-and-remove-spoilers-from-summaries-prompt.md");
    expect(prompt).toContain('"slug": "alice"');
    expect(prompt).toContain('"name": "Alice"');
    expect(prompt).toContain('"slug": "bob"');
    expect(prompt).toContain('"name": "Bob"');
  });

  it("supports explicit override input without reading default reference file", async () => {
    state.readBookFileMock.mockImplementation(() => {
      throw new Error("Should not read default file when override is provided");
    });
    state.callGeminiMock.mockResolvedValue({
      characters: [
        { slug: "victor-frankenstein", referenceCard: "Clean Victor", role: "Obsessed Scientist" },
      ],
    });

    const result = await generateWithOptions({
      inputCharacters: [
        {
          slug: "victor-frankenstein",
          name: "Victor Frankenstein",
          referenceCard: "Original Victor",
        },
      ],
    });

    expect(state.readBookFileMock).not.toHaveBeenCalled();
    expect(result.characters).toEqual([
      { slug: "victor-frankenstein", referenceCard: "Clean Victor", role: "Obsessed Scientist" },
    ]);
  });

  it("falls back when provider response misses required slugs", async () => {
    state.callGeminiMock.mockResolvedValue({
      characters: [{ slug: "alice", referenceCard: "Only one", role: "Lead" }],
    });
    state.callGpt5Mock.mockResolvedValue(cleanedBy("gpt-5"));

    const result = await generateWithOptions();

    expect(result.characters).toHaveLength(2);
    expect(result.characters[1].slug).toBe("bob");
    expect(result.characters[1].referenceCard).toBe("Clean Bob (gpt-5)");
    expect(state.callGpt5Mock).toHaveBeenCalledTimes(1);
  });

  it("falls back when provider response includes extra slugs not in input", async () => {
    state.callGeminiMock.mockResolvedValue({
      characters: [
        { slug: "alice", referenceCard: "Clean Alice", role: "Hero" },
        { slug: "bob", referenceCard: "Clean Bob", role: "Friend" },
        { slug: "eve", referenceCard: "Unexpected", role: "Intruder" },
      ],
    });
    state.callGpt5Mock.mockResolvedValue(cleanedBy("gpt-5"));

    const result = await generateWithOptions();

    expect(result.characters.map((character) => character.slug)).toEqual(["alice", "bob"]);
    expect(result.characters[0].referenceCard).toBe("Clean Alice (gpt-5)");
  });

  it("throws when Gemini API, Vertex, and GPT-5 all fail", async () => {
    state.callGeminiMock.mockRejectedValue(new Error("gemini down"));
    state.callGpt5Mock.mockRejectedValue(new Error("gpt down"));

    await expect(generateWithOptions()).rejects.toThrow(
      /failed to generate spoiler-cleaned summaries and roles/i,
    );
  });
});
