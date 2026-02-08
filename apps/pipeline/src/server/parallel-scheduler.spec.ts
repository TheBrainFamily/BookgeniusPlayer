import { describe, expect, it } from "vitest";
import { canRunStep, getMissingStepDeps, getStepDeps } from "./parallel-scheduler";

describe("parallel-scheduler step dependencies", () => {
  it("requires generate_reference_cards before generate_character_roles", () => {
    expect(getStepDeps("generate_character_roles")).toEqual(["generate_reference_cards"]);
  });

  it("requires generate_character_roles before generate_entity_pictures", () => {
    expect(getStepDeps("generate_entity_pictures")).toContain("generate_character_roles");
    expect(
      canRunStep(
        "generate_entity_pictures",
        new Set(["generate_graphical_style", "generate_picture_prompts"]),
      ),
    ).toBe(false);
    expect(
      canRunStep(
        "generate_entity_pictures",
        new Set([
          "generate_graphical_style",
          "generate_picture_prompts",
          "generate_character_roles",
        ]),
      ),
    ).toBe(true);
  });

  it("requires rewrite_paragraphs before map_summaries_to_paragraphs", () => {
    expect(getStepDeps("map_summaries_to_paragraphs")).toEqual(["rewrite_paragraphs"]);
  });

  it("allows map_summaries_to_paragraphs only after rewrite_paragraphs", () => {
    expect(canRunStep("map_summaries_to_paragraphs", new Set())).toBe(false);
    expect(canRunStep("map_summaries_to_paragraphs", new Set(["rewrite_paragraphs"]))).toBe(true);
  });

  it("lists transitive dependencies missing for single-step runs", () => {
    expect(getMissingStepDeps("generate_backgrounds", new Set())).toEqual([
      "import_epub",
      "create_settings",
      "generate_graphical_style",
    ]);
  });
});
