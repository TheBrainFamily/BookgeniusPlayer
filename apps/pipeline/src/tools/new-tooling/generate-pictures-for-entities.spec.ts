import { beforeEach, describe, expect, it, vi } from "vitest";
import { type NewReferenceCardsResponse } from "../../types";
import { generatePicturePrompts } from "./generate-pictures-for-entities";

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

vi.mock("../../helpers/writeBookFile", () => ({
  writeBookFile: vi.fn((fileName: string, content: string, fileType?: string) =>
    state.write(fileName, content, fileType),
  ),
}));

describe("generatePicturePrompts integration", () => {
  beforeEach(() => {
    state.reset();
    vi.clearAllMocks();
  });

  it("always writes scorecard artifact with expected coverage metrics", async () => {
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

    const result = await generatePicturePrompts(referenceCards, { experimentRunId: "test-run" });

    expect(result.characters.some((character) => character.name === "alice")).toBe(true);
    expect(result.characters.some((character) => character.name === "bob")).toBe(true);
    expect(
      result.characters.filter((character) => character.name === "generic-avatar"),
    ).toHaveLength(1);

    const scorecardRaw = state.files.get("visual-guide-experiments/test-run/scorecard.json");
    expect(scorecardRaw).toBeDefined();

    const scorecard = JSON.parse(scorecardRaw || "{}");
    expect(scorecard).toEqual(
      expect.objectContaining({
        requestedCharactersCount: 2,
        aReturnedCount: 2,
        cReturnedCount: 2,
        aMissingCount: 0,
        cMissingCount: 0,
        missingDelta: 0,
      }),
    );
    expect(scorecard.qualityHeuristics).toEqual(
      expect.objectContaining({ shortThreshold: 40, aEmptyPercent: 50, cEmptyPercent: 50 }),
    );

    expect(state.files.has("visual-guide-experiments/test-run/a-output.json")).toBe(true);
    expect(state.files.has("visual-guide-experiments/test-run/c-output.json")).toBe(true);
    expect(state.files.has("visual-guide-experiments/test-run/name-mapping.json")).toBe(true);
  });

  it("writes experiment artifacts even with default options", async () => {
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

    const result = await generatePicturePrompts(referenceCards, { experimentRunId: "default-run" });

    expect(result.characters.some((character) => character.name === "alice")).toBe(true);
    expect(result.characters.some((character) => character.name === "bob")).toBe(true);
    expect(
      result.characters.filter((character) => character.name === "generic-avatar"),
    ).toHaveLength(1);

    const experimentWrites = Array.from(state.files.keys()).filter((fileName) =>
      fileName.startsWith("visual-guide-experiments/"),
    );
    expect(experimentWrites).toEqual(
      expect.arrayContaining([
        "visual-guide-experiments/default-run/a-output.json",
        "visual-guide-experiments/default-run/c-output.json",
        "visual-guide-experiments/default-run/name-mapping.json",
        "visual-guide-experiments/default-run/scorecard.json",
      ]),
    );
  });
});
