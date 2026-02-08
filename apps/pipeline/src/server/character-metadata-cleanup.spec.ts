import { describe, expect, it, vi } from "vitest";
import {
  buildCleanedCharacterSummaryMap,
  parseCharacterRoleCleanupResponse,
  resolveCharacterMetadataForUpload,
} from "./character-metadata-cleanup";

describe("character-metadata-cleanup", () => {
  it("builds a slug-keyed map from cleaned response", () => {
    const map = buildCleanedCharacterSummaryMap({
      characters: [
        { slug: "victor-frankenstein", referenceCard: "Clean Victor", role: "Obsessed Student" },
        { slug: "elizabeth-lavenza", referenceCard: "Clean Elizabeth", role: null },
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

  it("warns and keeps first entry on duplicate slugs in cleaned response", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const map = buildCleanedCharacterSummaryMap({
      characters: [
        { slug: "victor-frankenstein", referenceCard: "First", role: "Role 1" },
        { slug: "victor-frankenstein", referenceCard: "Second", role: "Role 2" },
      ],
    });

    expect(map.get("victor-frankenstein")).toEqual({ referenceCard: "First", role: "Role 1" });
    expect(warnSpy).toHaveBeenCalledWith(
      "[character-metadata-cleanup] Duplicate cleaned character slug: victor-frankenstein",
    );
    warnSpy.mockRestore();
  });

  it("returns cleaned summary and role when available by slug", () => {
    const cleanedMap = buildCleanedCharacterSummaryMap({
      characters: [{ slug: "victor-frankenstein", referenceCard: "Clean Victor", role: "Student" }],
    });

    const result = resolveCharacterMetadataForUpload(
      { slug: "victor-frankenstein", referenceCard: "Original Victor" },
      cleanedMap,
    );

    expect(result).toEqual({ summary: "Clean Victor", role: "Student" });
  });

  it("falls back to original summary when cleaned entry is missing", () => {
    const result = resolveCharacterMetadataForUpload(
      { slug: "unknown-character", referenceCard: "Original Unknown" },
      new Map(),
    );

    expect(result).toEqual({ summary: "Original Unknown" });
  });

  it("fails fast for old malformed cleanup shape without slug", () => {
    expect(() =>
      parseCharacterRoleCleanupResponse({
        characters: [{ name: "Victor Frankenstein", referenceCard: "Clean Victor", role: "Hero" }],
      }),
    ).toThrow();
  });
});
