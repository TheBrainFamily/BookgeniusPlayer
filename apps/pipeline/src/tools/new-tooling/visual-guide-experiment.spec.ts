import { describe, expect, it } from "vitest";
import { buildVisualGuideScorecard } from "./visual-guide-experiment";

describe("buildVisualGuideScorecard", () => {
  it("computes returned/missing counts, delta, overlap, and heuristics", () => {
    const requested = ["alice", "bob", "carol"];

    const aOutput = {
      characters: [
        {
          name: "alice",
          visualGuide:
            "Young woman with bright green eyes, short black hair, and a worn red scarf.",
        },
        { name: "bob", visualGuide: "Tall man" },
      ],
    };

    const cOutput = {
      characters: [
        {
          name: "alice",
          visualGuide: "Young woman, pale skin, sharp jawline, cropped black hair, emerald eyes.",
        },
        {
          name: "carol",
          visualGuide:
            "Middle-aged woman, silver hair in a tight bun, narrow blue eyes, dark coat.",
        },
      ],
    };

    const scorecard = buildVisualGuideScorecard(requested, aOutput, cOutput);

    expect(scorecard.requestedCharactersCount).toBe(3);
    expect(scorecard.aReturnedCount).toBe(2);
    expect(scorecard.cReturnedCount).toBe(2);
    expect(scorecard.aMissingCount).toBe(1);
    expect(scorecard.cMissingCount).toBe(1);
    expect(scorecard.missingDelta).toBe(0);

    expect(scorecard.overlap.returnedIntersectionCount).toBe(1);
    expect(scorecard.overlap.requestedIntersectionCount).toBe(3);

    expect(scorecard.missingCharacters.a).toEqual(["carol"]);
    expect(scorecard.missingCharacters.c).toEqual(["bob"]);

    expect(scorecard.visualGuideLength.a.avg).toBe(41.5);
    expect(scorecard.visualGuideLength.a.min).toBe(8);
    expect(scorecard.visualGuideLength.a.max).toBe(75);

    expect(scorecard.qualityHeuristics.shortThreshold).toBe(40);
    expect(scorecard.qualityHeuristics.aEmptyPercent).toBe(33.33);
    expect(scorecard.qualityHeuristics.cEmptyPercent).toBe(33.33);
    expect(scorecard.qualityHeuristics.aTooShortPercent).toBe(33.33);
    expect(scorecard.qualityHeuristics.cTooShortPercent).toBe(0);
  });

  it("returns zero length stats and percentages for empty requested input", () => {
    const scorecard = buildVisualGuideScorecard([], { characters: [] }, { characters: [] });

    expect(scorecard.requestedCharactersCount).toBe(0);
    expect(scorecard.aReturnedCount).toBe(0);
    expect(scorecard.cReturnedCount).toBe(0);
    expect(scorecard.aMissingCount).toBe(0);
    expect(scorecard.cMissingCount).toBe(0);
    expect(scorecard.missingDelta).toBe(0);

    expect(scorecard.visualGuideLength.a).toEqual({ avg: 0, min: 0, max: 0 });
    expect(scorecard.visualGuideLength.c).toEqual({ avg: 0, min: 0, max: 0 });

    expect(scorecard.qualityHeuristics.aEmptyPercent).toBe(0);
    expect(scorecard.qualityHeuristics.cEmptyPercent).toBe(0);
    expect(scorecard.qualityHeuristics.aTooShortPercent).toBe(0);
    expect(scorecard.qualityHeuristics.cTooShortPercent).toBe(0);
  });

  it("uses first occurrence when a provider returns duplicate character names", () => {
    const requested = ["alice", "bob"];

    const scorecard = buildVisualGuideScorecard(
      requested,
      {
        characters: [
          {
            name: "alice",
            visualGuide:
              "Older man with a square jaw, gray beard, deep-set brown eyes, and a dark frock coat.",
          },
          { name: "alice", visualGuide: "short" },
          {
            name: "bob",
            visualGuide:
              "Teen boy, curly chestnut hair, freckles, bright blue eyes, and a wool vest.",
          },
        ],
      },
      {
        characters: [
          {
            name: "alice",
            visualGuide:
              "Older man with a square jaw, gray beard, deep-set brown eyes, and a dark frock coat.",
          },
          {
            name: "bob",
            visualGuide:
              "Teen boy, curly chestnut hair, freckles, bright blue eyes, and a wool vest.",
          },
        ],
      },
    );

    expect(scorecard.aReturnedCount).toBe(2);
    expect(scorecard.aMissingCount).toBe(0);
    expect(scorecard.qualityHeuristics.aTooShortPercent).toBe(0);
    expect(scorecard.visualGuideLength.a.min).toBeGreaterThanOrEqual(40);
  });
});
