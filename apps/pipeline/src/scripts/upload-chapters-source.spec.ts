import { expect, test } from "vitest";
import { mapFilenameToBasename, shouldUploadBasename } from "./upload-chapters-source";

test("mapFilenameToBasename for the rewritten-xmls", () => {
  const file = "rewritten-paragraphs-for-chapter-1.xml";
  const basename = mapFilenameToBasename(file);
  expect(basename).toBe("chapter-1.html");
});

test("mapFilenameToBasename for the chapter-N.html files", () => {
  const file = "chapter-1.html";
  const basename = mapFilenameToBasename(file);
  expect(basename).toBe("chapter-1.html");
});

test("shouldUploadBasename returns true when no filter is configured", () => {
  expect(shouldUploadBasename("chapter-1.html", null)).toBe(true);
});

test("shouldUploadBasename matches only basenames in provided set", () => {
  const onlySet = new Set(["chapter-2.html", "chapter-5.html"]);
  expect(shouldUploadBasename("chapter-2.html", onlySet)).toBe(true);
  expect(shouldUploadBasename("chapter-3.html", onlySet)).toBe(false);
});
