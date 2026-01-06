import { describe, it, expect } from "vitest";
import { parseVersionIdFromPath } from "./parseVersionIdFromPath";

describe("parseVersionIdFromPath", () => {
  const DEFAULT_BASE_PATH = "/am/file";

  describe("with default base path (/am/file)", () => {
    it("extracts versionId from valid URL", () => {
      const result = parseVersionIdFromPath(
        "/am/file/v/k57abc123def456/intro.mp3",
        DEFAULT_BASE_PATH,
      );
      expect(result).toBe("k57abc123def456");
    });

    it("handles filenames with multiple path segments", () => {
      const result = parseVersionIdFromPath(
        "/am/file/v/version123/path/to/nested/file.txt",
        DEFAULT_BASE_PATH,
      );
      expect(result).toBe("version123");
    });

    it("handles simple filenames", () => {
      const result = parseVersionIdFromPath("/am/file/v/abc/file.txt", DEFAULT_BASE_PATH);
      expect(result).toBe("abc");
    });
  });

  describe("with custom base path", () => {
    it("works with single-segment base path", () => {
      const result = parseVersionIdFromPath("/assets/v/ver123/image.png", "/assets");
      expect(result).toBe("ver123");
    });

    it("works with deeper base path", () => {
      const result = parseVersionIdFromPath("/api/v1/files/v/ver456/doc.pdf", "/api/v1/files");
      expect(result).toBe("ver456");
    });

    it("works with root base path", () => {
      const result = parseVersionIdFromPath("/v/ver789/data.json", "/");
      expect(result).toBe("ver789");
    });
  });

  describe("edge cases and error handling", () => {
    it("returns null when /v/ marker is missing", () => {
      const result = parseVersionIdFromPath("/am/file/version123/file.txt", DEFAULT_BASE_PATH);
      expect(result).toBeNull();
    });

    it("returns null when versionId is missing", () => {
      const result = parseVersionIdFromPath("/am/file/v/", DEFAULT_BASE_PATH);
      expect(result).toBeNull();
    });

    it("returns null when path is too short", () => {
      const result = parseVersionIdFromPath("/am/file/v", DEFAULT_BASE_PATH);
      expect(result).toBeNull();
    });

    it("returns null for empty pathname", () => {
      const result = parseVersionIdFromPath("", DEFAULT_BASE_PATH);
      expect(result).toBeNull();
    });

    it("extracts based on segment position (assumes URL already routed correctly)", () => {
      // Note: This function doesn't validate that base path content matches,
      // it just uses basePath to calculate the position of versionId.
      // The HTTP router handles actual path matching before this function is called.
      const result = parseVersionIdFromPath(
        "/other/path/v/ver123/file.txt",
        DEFAULT_BASE_PATH, // same segment count as "/other/path"
      );
      // Since both have 2 segments, it finds versionId at position 3
      expect(result).toBe("ver123");
    });

    it("handles pathname with leading slash variations", () => {
      // Both with and without leading slash should work
      const result1 = parseVersionIdFromPath("/am/file/v/ver123/file.txt", "/am/file");
      const result2 = parseVersionIdFromPath("/am/file/v/ver123/file.txt", "am/file");
      expect(result1).toBe("ver123");
      expect(result2).toBe("ver123");
    });

    it("handles base path with trailing slash", () => {
      const result = parseVersionIdFromPath("/am/file/v/ver123/file.txt", "/am/file/");
      expect(result).toBe("ver123");
    });
  });
});
