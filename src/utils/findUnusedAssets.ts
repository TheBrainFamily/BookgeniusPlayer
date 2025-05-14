/*  Detect “orphan” media files
 *  ───────────────────────────
 *  Any .png, *-listens.mp4, *-speaks.mp4 whose canonical stem
 *  does NOT correspond to the canonical stem of ANY character slug
 *  will be listed.
 *
 *  Usage:
 *    npx ts-node tools/findUnusedAssets.ts --book=Pharaon
 *    npx ts-node tools/findUnusedAssets.ts --book=Pharaon --suggest   # show near-miss suggestions
 */

import fs from "fs/promises";
import path from "path";
import { argv } from "process";
import { getBookData } from "@/booksData/getBookData";
import { remove as removeDiacritics } from "diacritics";

export function canonical(input: string): string {
  return removeDiacritics(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ── CLI flags ─────────────────────────────────────────── */
const bookArg = argv.find((a) => a.startsWith("--book="));
if (!bookArg) {
  console.error("❌  Missing --book=<BOOK_SLUG>");
  process.exit(1);
}
const BOOK = bookArg.split("=")[1];
const SUGGEST = argv.includes("--suggest");

const DIR = path.resolve(__dirname, `../../public_books/${BOOK}`);

/* ── small levenshtein helper for “did you mean …?” ───── */
function lev(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

(async () => {
  /* 1. collect canonical slugs from your DB ---------------------- */
  const { charactersData } = await getBookData();
  const slugSet = new Set<string>(charactersData.map((ch) => canonical(ch.slug)));

  /* 2. walk media dir ------------------------------------------- */
  const files = await fs.readdir(DIR);
  const unused: { file: string; key: string }[] = [];

  files.forEach((f) => {
    const base = f.replace(/-(listens|speaks)\.mp4$/, "").replace(/\.png$/, "");
    const key = canonical(base);

    if (f.includes(".mp3") || f.includes("background") || f.includes("chapter")) {
      return;
    }
    if (!slugSet.has(key)) unused.push({ file: f, key });
  });

  /* 3. report ---------------------------------------------------- */
  if (!unused.length) {
    console.log("✅  All media files map to a known character.");
    return;
  }

  console.log(`\n🗑  Unused media files (${unused.length}):\n`);
  for (const { file, key } of unused) {
    process.stdout.write(` • ${file}`);
    if (SUGGEST) {
      /* find closest slug to help spotting typos ----------------- */
      let best = { slug: "", dist: Infinity };
      slugSet.forEach((s) => {
        const d = lev(key, s);
        if (d < best.dist) best = { slug: s, dist: d };
      });
      if (best.dist <= 3) process.stdout.write(`   ← did you mean ${best.slug}?`);
    }
    process.stdout.write("\n");
  }
})();
