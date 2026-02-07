import { describe, expect, it } from "vitest";
import { resolveCharacterCardCaption } from "./characterCardCaption";

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
