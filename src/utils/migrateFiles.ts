import fs from "fs/promises";
import path from "path";
import { argv } from "process";
import { getBookData } from "@/booksData/getBookData";
import { CharacterData } from "@/utils/testCharactersFiles";

/* ------------------------------------------------------------------ */
/* -------- 1. helpers that reproduce the *old* file logic ---------- */
/* ------------------------------------------------------------------ */

function oldPictureFile(name: string): string {
  return `${name.replace(/[\s()\\']+/g, "-").toLowerCase()}.png`;
}

function oldListeningFile(name: string): string {
  return `${
    name
      .toLowerCase()
      .replace(/ /g, "-")
      .replace(/"/g, "") // <-- Add this back
      .replace(/(\(|\))/g, "") // <-- Correct this regex
  }-listens.mp4`;
}

function oldTalkingFile(name: string): string {
  return `${
    name
      .toLowerCase()
      .replace(/ /g, "-")
      .replace(/"/g, "") // <-- Add this back
      .replace(/(\(|\))/g, "") // <-- Correct this regex
  }-speaks.mp4`;
}

/* ------------------------------------------------------------------ */
/* -------- 2. runtime settings ------------------------------------- */
/* ------------------------------------------------------------------ */

const DRY_RUN = argv.includes("--dry-run");
const bookArg = argv.find((a) => a.startsWith("--book="));
if (!bookArg) {
  console.error("Missing --book=<BOOK_SLUG>");
  process.exit(1);
}
const BOOK_SLUG = bookArg.split("=")[1];
const publicDir = path.resolve(__dirname, `../../public_books/${BOOK_SLUG}`);

/* ------------------------------------------------------------------ */
/* -------- 3. main -------------------------------------------------- */
/* ------------------------------------------------------------------ */

async function main() {
  const bookData = await getBookData();

  type Move = { from: string; to: string };

  const moves: Move[] = [];

  (bookData.charactersData as CharacterData[]).forEach((ch) => {
    const { characterName: name, slug } = ch;

    moves.push(
      { from: oldPictureFile(name), to: `${slug.toLowerCase()}.png` },
      { from: oldListeningFile(name), to: `${slug.toLowerCase()}-listens.mp4` },
      { from: oldTalkingFile(name), to: `${slug.toLowerCase()}-speaks.mp4` },
    );
  });

  /* ---------- execute -------------------------------------------- */

  for (const { from, to } of moves) {
    const src = path.join(publicDir, from);
    const dst = path.join(publicDir, to);

    try {
      await fs.access(src);
    } catch {
      // source doesn’t exist → skip (but log so you can inspect later)
      console.warn(`⚠️  missing: ${from}`);
      continue;
    }

    try {
      await fs.access(dst);
      console.warn(`💡 target already exists, NOT moving: ${dst}`);
      continue; // already migrated
    } catch {
      /* target free – good */
    }

    if (DRY_RUN) {
      console.log(`DRY-RUN  : ${from} → ${to}`);
    } else {
      await fs.rename(src, dst);
      console.log(`moved    : ${from} → ${to}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
