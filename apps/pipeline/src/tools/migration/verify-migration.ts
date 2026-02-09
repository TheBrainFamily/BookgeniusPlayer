/**
 * Verify that migrated embedding files have valid paragraph references
 * in the new leaf extraction system.
 *
 * Usage: bun verify-migration.ts [bookSlug]
 */

import { readFileSync, existsSync } from "fs";
import * as cheerio from "cheerio";
import { extractLeafElements } from "./leaf-extraction";

const BOOKS_DATA = "/Users/lukaszgandecki/projects/bookgenius/backend/books-data";
const CHAPTERS_DIR = "/Users/lukaszgandecki/projects/bookgenius/frontend/ConvexAssets/books";

function slugToDataDir(s: string): string {
  return s.toLowerCase().replace(/-openai$/, "");
}

function verifyBook(bookSlug: string): void {
  const dataDir = slugToDataDir(bookSlug);
  const sumPath = `${BOOKS_DATA}/${dataDir}/temporary-output/summaries-with-paragraphs.json`;
  const embPath = `${BOOKS_DATA}/${dataDir}/temporary-output/embeddings.json`;

  if (!existsSync(sumPath) || !existsSync(embPath)) {
    console.log(`${bookSlug}: skip (no files)`);
    return;
  }

  const summaries = JSON.parse(readFileSync(sumPath, "utf-8"));
  const embeddings = JSON.parse(readFileSync(embPath, "utf-8"), (k: string, v: unknown) =>
    k === "Embeddings" ? undefined : v,
  ) as Array<[number, Array<{ paragraphNumber: number; chapter: number }>]>;

  let checked = 0;
  let valid = 0;
  let outOfBounds = 0;

  for (const [ch, docs] of embeddings) {
    const chPath = `${CHAPTERS_DIR}/${bookSlug}/chapters-source/chapter-${ch}.html`;
    if (!existsSync(chPath)) continue;

    const $ = cheerio.load(readFileSync(chPath, "utf-8"));
    const leaves = extractLeafElements($, ch);
    const bullets = summaries[ch - 1]?.chapterSummary?.chapterBulletPoints || [];

    for (const doc of docs) {
      checked++;
      const bullet = bullets.find(
        (b: { mainParagraphNumber: number }) => b.mainParagraphNumber === doc.paragraphNumber,
      );
      if (!bullet) continue;

      const allValid = bullet.paragraphNumbers.every((pn: number) => pn < leaves.length);
      if (allValid) {
        valid++;
      } else {
        outOfBounds++;
        const bad = bullet.paragraphNumbers.filter((pn: number) => pn >= leaves.length);
        console.log(
          `  Ch${ch} main=${doc.paragraphNumber}: refs ${bad.join(",")} out of bounds (max ${leaves.length - 1})`,
        );
      }
    }
  }

  console.log(
    `${bookSlug}: ${valid}/${checked} valid${outOfBounds > 0 ? `, ${outOfBounds} out of bounds` : ""}`,
  );
}

const AFFECTED = [
  "1984",
  "1984-English",
  "Alice-Wonderland",
  "Krolowa-Sniegu",
  "Lalka",
  "Midsummer-Nights-Dream",
  "Othello",
];

const books = process.argv[2] ? [process.argv[2]] : AFFECTED;
for (const book of books) {
  verifyBook(book);
}
