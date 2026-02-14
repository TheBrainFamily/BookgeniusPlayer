import * as cheerio from "cheerio";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { ChapterInfo } from "../types";

/**
 * Extracts individual chapters from a rich.xml file.
 *
 * Each `<section data-chapter="N">` becomes its own XHTML file, written to both:
 * - chapters/ (working copy the agent edits)
 * - chapters-original/ (pristine copy for text verification)
 */
export function extractChapters(richXmlPath: string, workspaceDir: string): ChapterInfo[] {
  const xml = readFileSync(richXmlPath, "utf-8");
  const $ = cheerio.load(xml, { xml: true });

  const chaptersDir = join(workspaceDir, "chapters");
  const originalsDir = join(workspaceDir, "chapters-original");
  mkdirSync(chaptersDir, { recursive: true });
  mkdirSync(originalsDir, { recursive: true });

  const chapters: ChapterInfo[] = [];

  $("section[data-chapter]").each((_, el) => {
    const section = $(el);
    const chapterNumber = parseInt(section.attr("data-chapter")!, 10);
    const content = $.html(section);

    const fileName = `chapter-${chapterNumber}.xhtml`;
    const filePath = join(chaptersDir, fileName);
    const originalFilePath = join(originalsDir, fileName);

    writeFileSync(filePath, content, "utf-8");
    writeFileSync(originalFilePath, content, "utf-8");

    chapters.push({ chapterNumber, filePath, originalFilePath });
  });

  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

  console.log(`Extracted ${chapters.length} chapters from ${richXmlPath}`);
  return chapters;
}
