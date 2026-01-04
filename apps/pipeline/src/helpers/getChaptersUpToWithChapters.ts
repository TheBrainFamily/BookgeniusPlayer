import { Chapter } from "../types";
import * as cheerio from "cheerio";

export const getChaptersUpToWithChapters = (from: number, upTo: number, chapters: string) => {
  const $ = cheerio.load(chapters, { xml: true });

  const parsedChapters: Chapter[] = [];
  $("chapter").each((_, element) => {
    const $element = $(element);
    const number = parseInt($element.attr("number") || "0", 10);
    const title = $element.find("title").text();
    const content = $element.find("content").text();

    parsedChapters.push({ number, title, content });
  });

  return parsedChapters.filter((chapter) => chapter.number >= from && chapter.number <= upTo);
};
