import * as cheerio from "cheerio";
import { readFileSync } from "fs";
import { extractLeafElements, extractDirectChildren } from "./leaf-extraction";

for (const ch of [35, 37]) {
  const html = readFileSync(`ConvexAssets/books/Lalka/chapters-source/chapter-${ch}.html`, "utf-8");
  const $ = cheerio.load(html);
  const old = extractDirectChildren($, ch);
  const leaf = extractLeafElements($, ch);
  console.log(`Ch${ch}: directChildren=${old.length} leaves=${leaf.length}`);
}
