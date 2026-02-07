import { beforeEach, describe, expect, it, vi } from "vitest";
import { type NewReferenceCardsResponse } from "../../types";
import { generatePicturePrompts } from "./generate-pictures-for-entities";
import { callGeminiWithThinkingAndSchemaAndParsed } from "../../callFastGemini";

type WriteCall = { fileName: string; content: string; fileType?: string };

const state = vi.hoisted(() => {
  const writes: WriteCall[] = [];
  const files = new Map<string, string>();

  function reset(): void {
    writes.length = 0;
    files.clear();
  }

  function write(fileName: string, content: string, fileType?: string): string {
    writes.push({ fileName, content, fileType });
    files.set(fileName, String(content));
    return `/tmp/${fileName}`;
  }

  return { writes, files, reset, write };
});

vi.mock("fs", () => ({ default: { readFileSync: vi.fn(() => "{{characters}}\n{{bookText}}") } }));

vi.mock("../../helpers/getBookSettings", () => ({
  getBookSettings: vi.fn(() => ({ startFromChapter: 1, numberOfChaptersToProcess: 1 })),
}));

vi.mock("../../helpers/getChaptersUpTo", () => ({
  getChaptersUpTo: vi.fn(() => [{ number: 1, title: "Chapter 1", content: "Book text." }]),
}));

vi.mock("../../helpers/writeBookFile", () => ({
  writeBookFile: vi.fn((fileName: string, content: string, fileType?: string) =>
    state.write(fileName, content, fileType),
  ),
}));

vi.mock("../../callFastGemini", () => ({
  callGeminiWithThinking: vi.fn(),
  callGeminiWithThinkingAndSchemaAndParsed: vi.fn(),
}));

describe("generatePicturePrompts integration", () => {
  beforeEach(() => {
    state.reset();
    vi.clearAllMocks();

    vi.mocked(callGeminiWithThinkingAndSchemaAndParsed).mockResolvedValue({
      characters: [
        {
          name: "alice",
          visualGuide:
            "Young woman with pale skin, short black hair, bright green eyes, and a crimson scarf.",
        },
      ],
    });
  });

  it("writes scorecard artifact with expected coverage metrics in ac-shadow mode", async () => {
    const referenceCards: NewReferenceCardsResponse = {
      characters: [
        {
          name: "Alice",
          referenceCard: "Reference for Alice",
          visualGuide:
            "Young woman with pale skin, short black hair, bright green eyes, and a crimson scarf.",
        },
        { name: "Bob", referenceCard: "Reference for Bob", visualGuide: "" },
        {
          name: "generic-avatar",
          referenceCard: "Synthetic",
          visualGuide: "Synthetic fallback avatar",
        },
      ],
    };

    const result = await generatePicturePrompts(referenceCards, {
      experimentMode: "ac-shadow",
      experimentRunId: "test-run",
    });

    expect(result.characters.some((character) => character.name === "alice")).toBe(true);
    expect(
      result.characters.filter((character) => character.name === "generic-avatar"),
    ).toHaveLength(1);

    const scorecardRaw = state.files.get("visual-guide-experiments/test-run/scorecard.json");
    expect(scorecardRaw).toBeDefined();

    const scorecard = JSON.parse(scorecardRaw || "{}");
    expect(scorecard).toEqual(
      expect.objectContaining({
        requestedCharactersCount: 2,
        aReturnedCount: 1,
        cReturnedCount: 2,
        aMissingCount: 1,
        cMissingCount: 0,
        missingDelta: -1,
      }),
    );
    expect(scorecard.qualityHeuristics).toEqual(
      expect.objectContaining({ shortThreshold: 40, aEmptyPercent: 50, cEmptyPercent: 50 }),
    );

    expect(state.files.has("visual-guide-experiments/test-run/a-output.json")).toBe(true);
    expect(state.files.has("visual-guide-experiments/test-run/c-output.json")).toBe(true);
    expect(state.files.has("visual-guide-experiments/test-run/name-mapping.json")).toBe(true);
  });

  it("keeps normal behavior and skips experiment artifacts when experiment mode is off", async () => {
    const referenceCards: NewReferenceCardsResponse = {
      characters: [
        {
          name: "Alice",
          referenceCard: "Reference for Alice",
          visualGuide: "Alice reference visual guide",
        },
        {
          name: "Bob",
          referenceCard: "Reference for Bob",
          visualGuide: "Bob reference visual guide",
        },
      ],
    };

    const result = await generatePicturePrompts(referenceCards, { experimentMode: "off" });

    expect(result.characters.some((character) => character.name === "alice")).toBe(true);
    expect(
      result.characters.filter((character) => character.name === "generic-avatar"),
    ).toHaveLength(1);
    expect(vi.mocked(callGeminiWithThinkingAndSchemaAndParsed)).toHaveBeenCalledTimes(1);

    const experimentWrites = Array.from(state.files.keys()).filter((fileName) =>
      fileName.startsWith("visual-guide-experiments/"),
    );
    expect(experimentWrites).toHaveLength(0);
  });
});
