/**
 * Query Convex to find books with background/music cues at non-zero paragraph positions.
 * These are the only books that need index migration.
 */

import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_URL || "https://willing-pig-943.convex.cloud";

async function findBooksWithCues() {
  const client = new ConvexHttpClient(CONVEX_URL);

  console.log("🔍 Querying Convex for books with cues at paragraph > 0...\n");

  const books = (await client.query("migration:findBooksWithNonZeroParagraphCues" as any, {})) as Array<{
    bookPath: string;
    backgrounds: number;
    music: number;
    totalCues: number;
  }>;

  console.log(`Found ${books.length} books with cues at paragraph > 0:\n`);

  let totalCues = 0;
  for (const book of books) {
    console.log(
      `  ${book.bookPath.replace("books/", "")}:`,
      `${book.totalCues} cues (${book.backgrounds} bg, ${book.music} music)`,
    );
    totalCues += book.totalCues;
  }

  console.log(`\nTotal: ${totalCues} cues across ${books.length} books`);

  return books;
}

if (require.main === module) {
  findBooksWithCues()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}

export { findBooksWithCues };
