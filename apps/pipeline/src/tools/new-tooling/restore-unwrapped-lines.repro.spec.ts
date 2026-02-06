import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { restoreUnwrappedLines } from "./restore-unwrapped-lines";

const baseDir = path.resolve(
  __dirname,
  "../../../books-data/a-a-milne_the-red-house-mystery/temporary-output",
);

const reproCases = [
  {
    chapter: 11,
    broken: "broken-rewritten-paragraphs-for-chapter-11-callGeminiWrapper.xml",
    original: "original-paragraphs-for-chapter-11.xml",
  },
  {
    chapter: 18,
    broken: "broken-rewritten-paragraphs-for-chapter-18-callGeminiWrapper.xml",
    original: "original-paragraphs-for-chapter-18.xml",
  },
];

describe("restoreUnwrappedLines repro cases", () => {
  if (!existsSync(baseDir)) {
    // eslint-disable-next-line vitest/no-disabled-tests
    it.skip("requires books-data for a-a-milne_the-red-house-mystery", () => {});
    return;
  }

  for (const repro of reproCases) {
    it(`repairs structural XML issues for chapter ${repro.chapter}`, () => {
      const brokenPath = path.join(baseDir, repro.broken);
      const originalPath = path.join(baseDir, repro.original);

      if (!existsSync(brokenPath) || !existsSync(originalPath)) {
        return;
      }

      const brokenXml = readFileSync(brokenPath, "utf-8");
      const originalXml = readFileSync(originalPath, "utf-8");
      const restored = restoreUnwrappedLines(originalXml, brokenXml);

      const parser = new DOMParser();
      const doc = parser.parseFromString(`<Chapter>${restored}</Chapter>`, "text/html");
      const parserErrors = doc.getElementsByTagName("parsererror");
      expect(parserErrors.length).toBe(0);
    });
  }
});
