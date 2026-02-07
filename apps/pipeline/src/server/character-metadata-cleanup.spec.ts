import { describe, expect, it } from "vitest";
import {
  buildCleanedCharacterSummaryMap,
  resolveCharacterMetadataForUpload,
} from "./character-metadata-cleanup";

describe("character-metadata-cleanup", () => {
  it("builds a slug-keyed map and keeps first duplicate slug entry", () => {
    const map = buildCleanedCharacterSummaryMap({
      characters: [
        { name: "Victor Frankenstein", referenceCard: "Clean Victor", role: "Obsessed Student" },
        { name: "Victor   Frankenstein", referenceCard: "Duplicate Victor", role: "Duplicate" },
        { name: "Elizabeth Lavenza", referenceCard: "Clean Elizabeth", role: null },
      ],
    });

    expect(map.get("victor-frankenstein")).toEqual({
      referenceCard: "Clean Victor",
      role: "Obsessed Student",
    });
    expect(map.get("elizabeth-lavenza")).toEqual({
      referenceCard: "Clean Elizabeth",
      role: undefined,
    });
  });

  it("returns cleaned summary and role when available", () => {
    const cleanedMap = buildCleanedCharacterSummaryMap({
      characters: [{ name: "Victor Frankenstein", referenceCard: "Clean Victor", role: "Student" }],
    });

    const result = resolveCharacterMetadataForUpload(
      { name: "Victor Frankenstein", referenceCard: "Original Victor" },
      cleanedMap,
    );

    expect(result).toEqual({ summary: "Clean Victor", role: "Student" });
  });

  it("falls back to original summary when cleaned entry is missing", () => {
    const result = resolveCharacterMetadataForUpload(
      { name: "Unknown Character", referenceCard: "Original Unknown" },
      new Map(),
    );

    expect(result).toEqual({ summary: "Original Unknown" });
  });
});
