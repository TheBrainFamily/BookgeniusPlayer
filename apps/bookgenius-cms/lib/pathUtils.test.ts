import { describe, it, expect } from "vitest";
import { extractBookPath } from "./pathUtils";

describe("extractBookPath", () => {
  it("extracts book path from direct subfolders", () => {
    expect(extractBookPath("books/my-book/backgrounds")).toBe("books/my-book");
    expect(extractBookPath("books/my-book/music")).toBe("books/my-book");
    expect(extractBookPath("books/my-book/chapters")).toBe("books/my-book");
  });

  it("extracts book path from nested subfolders", () => {
    // This is the bug case the reviewer identified
    expect(extractBookPath("books/my-book/characters/hero")).toBe("books/my-book");
    expect(extractBookPath("books/my-book/characters/hero/extra")).toBe("books/my-book");
    expect(extractBookPath("books/my-book/backgrounds/variants/dark")).toBe("books/my-book");
  });

  it("handles book slugs with special characters", () => {
    expect(extractBookPath("books/jane-eyre/music")).toBe("books/jane-eyre");
    expect(extractBookPath("books/1984-English/chapters")).toBe("books/1984-English");
    expect(extractBookPath("books/Lalka/backgrounds")).toBe("books/Lalka");
  });

  it("returns null for non-book paths", () => {
    expect(extractBookPath("templates/default")).toBeNull();
    expect(extractBookPath("shared/assets")).toBeNull();
    expect(extractBookPath("")).toBeNull();
  });

  it("returns null for paths that are just 'books' without a slug", () => {
    expect(extractBookPath("books")).toBeNull();
    expect(extractBookPath("books/")).toBeNull();
  });

  it("handles the book root path correctly", () => {
    expect(extractBookPath("books/my-book")).toBe("books/my-book");
  });
});
