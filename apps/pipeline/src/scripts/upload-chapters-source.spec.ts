import { expect, test } from "vitest";
import { mapFilenameToBasename } from "./upload-chapters-source";

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
