import { Chapter } from "../types";
import * as cheerio from "cheerio";

export const getChaptersUpToWithChapters = (from: number, upTo: number, chapters: string) => {
  // Parse chapters XML using cheerio
  const $ = cheerio.load(chapters, { xml: true });

  // console.log("chapters", chapters);
  // Extract all chapters
  const parsedChapters: Chapter[] = [];
  $("chapter").each((_, element) => {
    const $element = $(element);
    const number = parseInt($element.attr("number") || "0", 10);
    const title = $element.find("title").text();
    const content = $element.find("content").text();

    parsedChapters.push({ number, title, content });
  });
  console.log(
    "\n\n\nparsedChapters",
    parsedChapters.map((chapter) => chapter.number),
  );

  console.log("from", from);
  console.log("upTo", upTo);

  // Filter chapters based on the provided range
  return parsedChapters.filter((chapter) => chapter.number >= from && chapter.number <= upTo);
};
