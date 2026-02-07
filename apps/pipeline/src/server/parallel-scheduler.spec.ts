import { describe, expect, it } from "vitest";
import { canRunStep, getStepDeps } from "./parallel-scheduler";

describe("parallel-scheduler step dependencies", () => {
  it("requires rewrite_paragraphs before map_summaries_to_paragraphs", () => {
    expect(getStepDeps("map_summaries_to_paragraphs")).toEqual(["rewrite_paragraphs"]);
  });

  it("allows map_summaries_to_paragraphs only after rewrite_paragraphs", () => {
    expect(canRunStep("map_summaries_to_paragraphs", new Set())).toBe(false);
    expect(canRunStep("map_summaries_to_paragraphs", new Set(["rewrite_paragraphs"]))).toBe(true);
  });
});
