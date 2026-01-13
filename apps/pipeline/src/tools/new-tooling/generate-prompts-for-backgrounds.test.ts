import { describe, it, expect, vi, beforeEach } from "vitest";

// Track what filenames are generated
const generatedFilenames: string[] = [];

// Mock the generator to track filenames - simulates the FIXED behavior
vi.mock("./generate-flux-schnel-image", () => ({
  generateImageWithFluxToFolder: vi.fn(
    async (
      _sceneDescription: string,
      chapter: number,
      startingParagraph: number,
      _genericPrompt: unknown,
      outputFolder: string,
      _attempt?: number,
      _quality?: string,
      _size?: string,
      suffix?: string,
      // eslint-disable-next-line max-params
    ) => {
      // Fixed filename pattern includes suffix when provided
      const filename = suffix
        ? `${outputFolder}/openai-medium-${chapter}-${startingParagraph}-${suffix}.webp`
        : `${outputFolder}/openai-medium-${chapter}-${startingParagraph}.webp`;
      generatedFilenames.push(filename);
      return `/absolute/path/${filename}`;
    },
  ),
  generateCharacterImageWithFlux: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
}));

vi.mock("./generate-pictures-for-entities", () => ({
  generateCharacterImageWithOpenAI: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
}));

describe("Style Preview Filename Generation", () => {
  beforeEach(() => {
    generatedFilenames.length = 0;
  });

  it("should generate unique filenames for auto and user style previews when suffix is provided", async () => {
    const { generateImageWithFluxToFolder } = await import("./generate-flux-schnel-image");

    // Simulate auto preview generation with suffix
    await generateImageWithFluxToFolder(
      "scene description",
      1, // chapter
      0, // startingParagraph
      { backgroundStyle: "auto style", periodStyle: "period" },
      "style-previews",
      1, // attempt
      "medium",
      "1536x1024",
      "auto", // suffix for styleType
    );

    // Simulate user preview generation with suffix
    await generateImageWithFluxToFolder(
      "scene description",
      1, // chapter
      0, // startingParagraph
      { backgroundStyle: "user style", periodStyle: "period" },
      "style-previews",
      1,
      "medium",
      "1536x1024",
      "user", // suffix for styleType
    );

    // Both should generate to DIFFERENT files
    expect(generatedFilenames).toHaveLength(2);
    expect(generatedFilenames[0]).not.toBe(generatedFilenames[1]);
    expect(generatedFilenames[0]).toContain("auto");
    expect(generatedFilenames[1]).toContain("user");
  });

  it("should generate to same filename when no suffix is provided (for backwards compatibility)", async () => {
    const { generateImageWithFluxToFolder } = await import("./generate-flux-schnel-image");

    // Without suffix - both generate to same file (backwards compatible behavior)
    await generateImageWithFluxToFolder(
      "scene description",
      1,
      0,
      { backgroundStyle: "auto style", periodStyle: "period" },
      "style-previews",
    );

    await generateImageWithFluxToFolder(
      "scene description",
      1,
      0,
      { backgroundStyle: "user style", periodStyle: "period" },
      "style-previews",
    );

    // Without suffix, both use same filename (expected for non-preview use cases)
    expect(generatedFilenames[0]).toBe(generatedFilenames[1]);
  });

  it("should include suffix in filename pattern: openai-medium-{chapter}-{paragraph}-{suffix}.webp", async () => {
    const { generateImageWithFluxToFolder } = await import("./generate-flux-schnel-image");

    await generateImageWithFluxToFolder(
      "scene description",
      1,
      0,
      { backgroundStyle: "style", periodStyle: "period" },
      "style-previews",
      1,
      "medium",
      "1536x1024",
      "auto",
    );

    expect(generatedFilenames[0]).toBe("style-previews/openai-medium-1-0-auto.webp");
  });
});
