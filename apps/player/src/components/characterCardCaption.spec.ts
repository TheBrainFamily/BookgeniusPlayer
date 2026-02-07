import { describe, expect, it } from "vitest";
import { resolveCharacterCardCaption, stripParenthetical } from "./characterCardCaption";

describe("resolveCharacterCardCaption", () => {
  it("prefers role when role is present", () => {
    expect(resolveCharacterCardCaption("Lead Detective", "Original summary")).toBe(
      "Lead Detective",
    );
  });

  it("falls back to summary when role is missing", () => {
    expect(resolveCharacterCardCaption(undefined, "Original summary")).toBe("Original summary");
  });

  it("trims whitespace and returns empty string when both are blank", () => {
    expect(resolveCharacterCardCaption("   ", "  ")).toBe("");
  });
});

describe("stripParenthetical", () => {
  it("strips parenthetical when prefix is longer than 5 chars", () => {
    expect(stripParenthetical("Elizabeth's foster parents (peasant man and wife, unnamed)")).toBe(
      "Elizabeth's foster parents",
    );
  });

  it("keeps parenthetical when prefix is 5 chars or fewer", () => {
    expect(stripParenthetical("Bob (Jr)")).toBe("Bob (Jr)");
  });

  it("returns name unchanged when no parenthesis present", () => {
    expect(stripParenthetical("Victor Frankenstein")).toBe("Victor Frankenstein");
  });

  it("trims trailing whitespace after stripping", () => {
    expect(stripParenthetical("Captain Ahab (the whaler)")).toBe("Captain Ahab");
  });
});
