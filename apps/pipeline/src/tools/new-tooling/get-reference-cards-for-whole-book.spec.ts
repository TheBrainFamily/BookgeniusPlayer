import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewReferenceCardsResponseSchema } from "../../schemes";
import { getReferenceCardsForWholeBook } from "./get-reference-cards-for-whole-book";
import { callGpt5WithSchema } from "../../callGpt5";
import { callGeminiWithThinkingAndSchemaAndParsed } from "../../callFastGemini";
import { writeBookFile } from "../../helpers/writeBookFile";
import { getCurrentBookSlug } from "../../helpers/getCurrentBook";

type WriteCall = { fileName: string; content: string; fileType?: string };

const state = vi.hoisted(() => {
  const writes: WriteCall[] = [];
  const files = new Map<string, string>();
  const inputFiles = new Map<string, string>();

  function reset(): void {
    writes.length = 0;
    files.clear();
    inputFiles.clear();
  }

  function write(fileName: string, content: string, fileType?: string): string {
    writes.push({ fileName, content, fileType });
    files.set(fileName, content);
    return `/tmp/${fileName}`;
  }

  function setInput(fileName: string, content: string): void {
    inputFiles.set(fileName, content);
  }

  function readInput(fileName: string): string {
    const content = inputFiles.get(fileName);
    if (content === undefined) {
      throw new Error(`Missing mocked input file: ${fileName}`);
    }
    return content;
  }

  function hasInput(fileName: string): boolean {
    return inputFiles.has(fileName);
  }

  return { writes, files, inputFiles, reset, write, setInput, readInput, hasInput };
});

vi.mock("fs", () => ({ default: { readFileSync: vi.fn(() => "PROMPT TEMPLATE\n") } }));

vi.mock("../../helpers/getBookSettings", () => ({
  getBookSettings: vi.fn(() => ({ startFromChapter: 1, numberOfChaptersToProcess: 2 })),
}));

vi.mock("../../helpers/getChaptersUpTo", () => ({
  getChaptersUpTo: vi.fn(() => [
    { number: 1, title: "One", content: "A" },
    { number: 2, title: "Two", content: "B" },
  ]),
}));

vi.mock("../../helpers/writeBookFile", () => ({
  writeBookFile: vi.fn((fileName: string, content: string, fileType?: string) =>
    state.write(fileName, content, fileType),
  ),
}));

vi.mock("../../helpers/readBookFile", () => ({
  readBookFile: vi.fn((fileName: string) => state.readInput(fileName)),
  doesBookFileExist: vi.fn((fileName: string) => state.hasInput(fileName)),
}));

vi.mock("../../helpers/getCurrentBook", () => ({
  getCurrentBookSlug: vi.fn(() => "some-default-slug"),
}));

vi.mock("../../callGpt5", () => ({ callGpt5WithSchema: vi.fn() }));

vi.mock("../../callFastGemini", () => ({ callGeminiWithThinkingAndSchemaAndParsed: vi.fn() }));

function gptResponse() {
  return {
    characters: [
      { name: "Alice", referenceCard: "From GPT", visualGuide: "Alice visual guide from GPT" },
    ],
  };
}

function geminiFlashResponse() {
  return {
    characters: [
      {
        name: "Bob",
        referenceCard: "From Gemini Flash",
        visualGuide: "Bob visual guide from Gemini Flash",
      },
    ],
  };
}

function geminiProResponse() {
  return {
    characters: [
      {
        name: "Carol",
        referenceCard: "From Gemini Pro",
        visualGuide: "Carol visual guide from Gemini Pro",
      },
    ],
  };
}

function parseManifestRows(): Array<Record<string, unknown>> {
  const manifest = state.files.get("reference-cards-benchmarks/spec-run/manifest.ndjson");
  if (!manifest) return [];
  return manifest
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("getReferenceCardsForWholeBook", () => {
  beforeEach(() => {
    state.reset();
    vi.clearAllMocks();
    process.env.REFERENCE_CARDS_BENCHMARK_RUN_ID = "spec-run";
    process.env.REFERENCE_CARDS_GEMINI_PRO_SAMPLE_RATE = "0.1";
    vi.spyOn(Math, "random").mockReturnValue(0.9);

    vi.mocked(callGpt5WithSchema).mockResolvedValue(gptResponse());
    vi.mocked(callGeminiWithThinkingAndSchemaAndParsed).mockImplementation(
      async (_prompt: string, _schema, model?: string) =>
        model === "gemini-3-pro-preview" ? geminiProResponse() : geminiFlashResponse(),
    );
  });

  it("returns GPT-5 result when GPT-5 and Gemini Flash both succeed", async () => {
    const result = await getReferenceCardsForWholeBook();

    expect(result.characters.some((c) => c.name === "Alice")).toBe(true);
    expect(result.characters.some((c) => c.name === "Bob")).toBe(false);
    expect(result.characters.filter((c) => c.name === "generic-avatar")).toHaveLength(1);
    expect(callGpt5WithSchema).toHaveBeenCalledTimes(1);
    expect(callGeminiWithThinkingAndSchemaAndParsed).toHaveBeenCalledWith(
      expect.any(String),
      NewReferenceCardsResponseSchema,
      "gemini-3-flash-preview",
    );
  });

  it("falls back to Gemini Flash when GPT-5 fails", async () => {
    vi.mocked(callGpt5WithSchema).mockRejectedValue(new Error("gpt down"));

    const result = await getReferenceCardsForWholeBook();

    expect(result.characters.some((c) => c.name === "Bob")).toBe(true);
    expect(result.characters.some((c) => c.name === "generic-avatar")).toBe(true);
  });

  it("throws when GPT-5 and Gemini Flash both fail", async () => {
    vi.mocked(callGpt5WithSchema).mockRejectedValue(new Error("gpt failed"));
    vi.mocked(callGeminiWithThinkingAndSchemaAndParsed).mockRejectedValue(
      new Error("gemini failed"),
    );

    await expect(getReferenceCardsForWholeBook()).rejects.toThrow(/gpt failed/i);
    await expect(getReferenceCardsForWholeBook()).rejects.toThrow(/gemini failed/i);
  });

  it("runs GPT-5 and Gemini Flash in parallel", async () => {
    let resolveGpt: ((value: ReturnType<typeof gptResponse>) => void) | undefined;
    let resolveGem: ((value: ReturnType<typeof geminiFlashResponse>) => void) | undefined;

    const gptStarted = vi.fn();
    const gemStarted = vi.fn();

    vi.mocked(callGpt5WithSchema).mockImplementation(async () => {
      gptStarted();
      return new Promise<ReturnType<typeof gptResponse>>((resolve) => {
        resolveGpt = resolve;
      });
    });

    vi.mocked(callGeminiWithThinkingAndSchemaAndParsed).mockImplementation(async () => {
      gemStarted();
      return new Promise<ReturnType<typeof geminiFlashResponse>>((resolve) => {
        resolveGem = resolve;
      });
    });

    const pending = getReferenceCardsForWholeBook();
    await Promise.resolve();
    await Promise.resolve();

    expect(gptStarted).toHaveBeenCalledTimes(1);
    expect(gemStarted).toHaveBeenCalledTimes(1);

    resolveGpt?.(gptResponse());
    resolveGem?.(geminiFlashResponse());
    await pending;
  });

  it("runs Gemini Pro in sampled requests and writes pro artifact", async () => {
    vi.mocked(Math.random).mockReturnValue(0.01);

    const result = await getReferenceCardsForWholeBook();

    expect(result.characters.some((c) => c.name === "Alice")).toBe(true);
    expect(callGeminiWithThinkingAndSchemaAndParsed).toHaveBeenCalledTimes(2);
    expect(callGeminiWithThinkingAndSchemaAndParsed).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      NewReferenceCardsResponseSchema,
      "gemini-3-pro-preview",
    );
    expect(state.files.has("reference-cards-benchmarks/spec-run/outputs/gemini-pro.json")).toBe(
      true,
    );
  });

  it("marks Gemini Pro as not sampled when random is above threshold", async () => {
    vi.mocked(Math.random).mockReturnValue(0.9);

    await getReferenceCardsForWholeBook();

    const rows = parseManifestRows();
    const proRow = rows.find((row) => row.provider === "gemini-pro");
    expect(proRow).toBeDefined();
    expect(proRow?.sampled).toBe(false);
    expect(proRow?.status).toBe("skipped");
  });

  it("does not fail when sampled Gemini Pro fails and GPT-5 succeeds", async () => {
    vi.mocked(Math.random).mockReturnValue(0.01);
    vi.mocked(callGeminiWithThinkingAndSchemaAndParsed).mockImplementation(
      async (_prompt: string, _schema, model?: string) => {
        if (model === "gemini-3-pro-preview") {
          throw new Error("pro failed");
        }
        return geminiFlashResponse();
      },
    );

    const result = await getReferenceCardsForWholeBook();

    expect(result.characters.some((c) => c.name === "Alice")).toBe(true);
    const rows = parseManifestRows();
    const proRow = rows.find((row) => row.provider === "gemini-pro");
    expect(proRow?.status).toBe("failure");
  });

  it("keeps generic-avatar only once", async () => {
    vi.mocked(callGpt5WithSchema).mockResolvedValue({
      characters: [
        { name: "Alice", referenceCard: "From GPT", visualGuide: "Alice visual guide from GPT" },
        {
          name: "generic-avatar",
          referenceCard: "Already there",
          visualGuide: "Generic visual guide already there",
        },
      ],
    });

    const result = await getReferenceCardsForWholeBook();
    expect(result.characters.filter((c) => c.name === "generic-avatar")).toHaveLength(1);
  });

  it("writes benchmark artifacts under dedicated run folder", async () => {
    await getReferenceCardsForWholeBook();

    const benchmarkWrites = state.writes.filter((write) =>
      write.fileName.startsWith("reference-cards-benchmarks/spec-run/"),
    );

    expect(benchmarkWrites.length).toBeGreaterThan(0);
    expect(state.files.has("reference-cards-benchmarks/spec-run/prompt.md")).toBe(true);
    expect(state.files.has("reference-cards-benchmarks/spec-run/summary.json")).toBe(true);
    expect(state.files.has("reference-cards-benchmarks/spec-run/outputs/selected.json")).toBe(true);
  });

  it("writes selected output using selected provider result", async () => {
    vi.mocked(callGpt5WithSchema).mockRejectedValue(new Error("gpt fail"));

    await getReferenceCardsForWholeBook();
    const selected = state.files.get("reference-cards-benchmarks/spec-run/outputs/selected.json");

    expect(selected).toBeDefined();
    expect(JSON.parse(selected || "{}").characters?.[0]?.name).toBe("Bob");
  });

  it("writes prompt snapshot for legacy and benchmark paths", async () => {
    await getReferenceCardsForWholeBook();
    expect(vi.mocked(writeBookFile)).toHaveBeenCalledWith(
      "get-reference-cards-for-whole-book-prompt.md",
      expect.any(String),
    );
    expect(state.files.has("reference-cards-benchmarks/spec-run/prompt.md")).toBe(true);
  });

  it("uses segmented path for hardcoded large novel slugs and keeps canonical first appearance", async () => {
    vi.mocked(getCurrentBookSlug).mockReturnValue(
      "leo-tolstoy_war-and-peace_louise-maude_aylmer-maude",
    );
    state.setInput(
      "se-chapter-metadata.json",
      JSON.stringify([
        { number: 1, sourceFilenames: ["chapter-1-1-1.xhtml"], segmentHints: ["part-1-1"] },
        { number: 2, sourceFilenames: ["chapter-2-1-1.xhtml"], segmentHints: ["part-2-1"] },
      ]),
    );

    let callIndex = 0;
    vi.mocked(callGpt5WithSchema).mockImplementation(async () => {
      callIndex += 1;
      if (callIndex === 1) {
        return {
          characters: [
            {
              slug: "alice",
              name: "Alice",
              referenceCard: "Alice first appearance",
              visualGuide: "Alice first visual",
            },
          ],
        };
      }

      return {
        characters: [
          {
            slug: "alice",
            name: "Alice (Ally)",
            referenceCard: "Alice later appearance",
            visualGuide: "Alice later visual",
          },
          {
            slug: "bob",
            name: "Bob",
            referenceCard: "Bob first appearance",
            visualGuide: "Bob first visual",
          },
        ],
      };
    });

    const result = await getReferenceCardsForWholeBook();

    expect(vi.mocked(callGpt5WithSchema)).toHaveBeenCalledTimes(2);
    const secondPrompt = vi.mocked(callGpt5WithSchema).mock.calls[1]?.[0] as string;
    expect(secondPrompt).toContain("Alice first appearance");
    expect(secondPrompt).toContain('"slug": "alice"');
    expect(secondPrompt).toContain('"canonicalName": "Alice"');
    expect(secondPrompt).toContain("Reuse existing character identity for known people.");
    expect(secondPrompt).toContain(
      "keep the same canonical name exactly (no added aliases/parenthetical variants).",
    );

    const alice = result.characters.find((character) => character.name === "Alice");
    const aliasedAlice = result.characters.find((character) => character.name === "Alice (Ally)");
    const bob = result.characters.find((character) => character.name === "Bob");
    expect(alice?.referenceCard).toBe("Alice first appearance");
    expect(alice?.visualGuide).toBe("Alice first visual");
    expect(aliasedAlice).toBeUndefined();
    expect(bob?.referenceCard).toBe("Bob first appearance");

    expect(state.files.has("single-summary-per-person-by-segment.json")).toBe(true);
    expect(state.files.has("single-summary-per-person-canonical.json")).toBe(true);
    expect(state.files.has("chapter-to-segment-map.json")).toBe(true);
  });
});
