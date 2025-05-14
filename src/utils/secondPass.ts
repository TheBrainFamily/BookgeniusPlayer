/* Second-pass asset fixer:
 * ───────────────────────
 * 1. Renames any existing media so its filename matches the new slug spec
 *    (using the same canonical() logic the app now relies on).
 * 2. Reports only the *actionable* gaps, respecting the real fallback rules:
 *      – speaks.mp4 is required if the character talks.
 *      – listens.mp4 OR a png covers purely-listening characters.
 */

import fs from "fs/promises";
import path from "path";
import { getBookData } from "@/booksData/getBookData";
import { remove as removeDiacritics } from "diacritics";

export function canonical(input: string): string {
  return removeDiacritics(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type AssetSet = { png?: string; listens?: string; speaks?: string };

export async function buildIndex(dir: string): Promise<Map<string, AssetSet>> {
  const files = await fs.readdir(dir);
  const index = new Map<string, AssetSet>();

  files.forEach((file) => {
    const base = file.replace(/-(listens|speaks)\.mp4$/, "").replace(/\.png$/, "");
    const key = canonical(base);

    const entry = index.get(key) ?? {};
    if (file.endsWith("-listens.mp4")) entry.listens = file;
    else if (file.endsWith("-speaks.mp4")) entry.speaks = file;
    else if (file.endsWith(".png")) entry.png = file;

    index.set(key, entry);
  });

  return index;
}
const BOOK = "Pharaon"; // <- change if needed
const DIR = path.resolve(__dirname, `../../public_books/${BOOK}`);
const DRY = process.argv.includes("--dry-run");

(async () => {
  const [index, { charactersData }] = await Promise.all([buildIndex(DIR), getBookData()]);

  /* --------------------- 1. Rename phase ----------------------- */
  for (const ch of charactersData) {
    const key = canonical(ch.slug);
    const assets = index.get(key) as AssetSet | undefined;
    if (!assets) continue; // none on disk → nothing to rename

    const wantBase = ch.slug.toLowerCase(); // final stem we want

    await Promise.all([maybeMove(assets.png, `${wantBase}.png`), maybeMove(assets.listens, `${wantBase}-listens.mp4`), maybeMove(assets.speaks, `${wantBase}-speaks.mp4`)]);
  }

  /* --------------------- 2. Verification phase ----------------- */
  for (const ch of charactersData) {
    const needSpeaks = ch.infoPerChapter.some((i) => i.paragraphsWhereTalking.length);
    const needListens = ch.infoPerChapter.some((i) => i.paragraphsWhereSpotted.length);

    const key = canonical(ch.slug);
    const a = index.get(key) ?? {};

    /* 2.1 Talkers MUST have speaks.mp4 */
    if (needSpeaks && !a.speaks) {
      console.log(`📢  missing SPEAKS  : ${ch.characterName}`);
    }

    /* 2.2 Pure-listeners need listens.mp4 OR png */
    if (!needSpeaks && needListens && !a.listens && !a.png) {
      console.log(`👂  missing LISTENS : ${ch.characterName} (png would also work)`);
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

/* ----------------------- helpers ------------------------------- */
async function maybeMove(current: string | undefined, target: string) {
  if (!current || current === target) return;

  const src = path.join(DIR, current);
  const dst = path.join(DIR, target);

  try {
    await fs.access(src); // ensure src exists
  } catch {
    return;
  } // nothing to do

  try {
    await fs.access(dst); // already there under correct name
    return;
  } catch {
    /* dst clear – good */
  }

  if (DRY) {
    console.log(`DRY   : ${current} → ${target}`);
  } else {
    await fs.rename(src, dst);
    console.log(`moved : ${current} → ${target}`);
  }
}
