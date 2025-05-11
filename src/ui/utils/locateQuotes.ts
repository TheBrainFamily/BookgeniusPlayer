import DiffMatchPatch from "diff-match-patch";

import { normalise } from "./normalise";
import type { ParagraphInfo, QuoteHit } from "../MarkdownComponent";

const dmp = new DiffMatchPatch();

export const similarity = (a: string, b: string): number => {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 10) return 0; // allow shorter quotes

  const diffs = dmp.diff_main(a, b);
  dmp.diff_cleanupSemantic(diffs);

  const edit = diffs.reduce((acc, [op, txt]) => {
    if (op === 0) return acc; // equal block – free

    // strip non-alphanumerics so commas, dashes, spaces cost 0
    const pure = txt.replace(/[^\p{L}\p{N}]/gu, "");
    if (!pure) return acc;

    // digits are weighted ×4 so “200”→“300” matters
    const digitPenalty = (pure.match(/\d/g) || []).length * 4;
    const letterPenalty = pure.length - (pure.match(/\d/g) || []).length;

    return acc + digitPenalty + letterPenalty;
  }, 0);

  return 1 - edit / maxLen;
};

export const locateQuotes = (quotes: string[], paragraphs: ParagraphInfo[], upTo: { chapter: number; paragraph: number }): QuoteHit[] => {
  const limited = paragraphs.filter((p) => p.chapter < upTo.chapter || (p.chapter === upTo.chapter && p.index <= upTo.paragraph));

  const hits: QuoteHit[] = [];

  quotes.forEach((quote) => {
    const qNorm = normalise(
      quote
        .replace(/[\n\r]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
    let best: QuoteHit | undefined;

    limited.forEach((p) => {
      // Cheap overlap filter: at least 3 shared 4‒char words
      const overlap = qNorm.split(/\s+/).filter((w) => w.length > 3 && p.norm.includes(w)).length;
      if (overlap < 3) return;

      const score = similarity(qNorm, p.norm);
      if (score > 0.55 && (!best || score > best.score)) {
        best = { quote, chapter: p.chapter, index: p.index, score };
      }
    });

    if (best) hits.push(best);
  });

  return hits;
};
