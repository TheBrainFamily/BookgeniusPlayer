import * as Diff from "diff";

type TagSpot = { modelPos: number; tag: string };

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function extractTagSpots(modelHtml: string): { tagSpots: TagSpot[]; modelPlain: string } {
  const tagRe = /<[^>]*>/g;
  const tagSpots: TagSpot[] = [];
  let plainCursor = 0;
  let htmlCursor = 0;

  for (const m of modelHtml.matchAll(tagRe)) {
    const tagIdx = m.index!;
    const textBefore = modelHtml.slice(htmlCursor, tagIdx);
    plainCursor += textBefore.length;
    tagSpots.push({ modelPos: plainCursor, tag: m[0] });
    htmlCursor = tagIdx + m[0].length;
  }

  const modelPlain = stripHtmlTags(modelHtml);
  return { tagSpots, modelPlain };
}

function buildPositionMapping(modelPlain: string, origPlain: string): { idxMap: number[]; finalOPos: number } {
  const idxMap: number[] = [];
  let mPos = 0;
  let oPos = 0;

  Diff.diffChars(modelPlain, origPlain).forEach((part) => {
    if (part.added) {
      oPos += part.value.length;
    } else if (part.removed) {
      for (let i = 0; i < part.value.length; i++, mPos++) {
        idxMap[mPos] = oPos;
      }
    } else {
      for (let i = 0; i < part.value.length; i++, mPos++, oPos++) {
        idxMap[mPos] = oPos;
      }
    }
  });

  return { idxMap, finalOPos: oPos };
}

function calculateDrift(origPlain: string, modelPlain: string): number {
  const deltaChars = Diff.diffChars(origPlain, modelPlain)
    .filter((p) => p.added || p.removed)
    .reduce((n, p) => n + p.value.length, 0);

  return origPlain.length === 0 ? 0 : deltaChars / origPlain.length;
}

function reassemble(tagSpots: TagSpot[], origPlain: string, idxMap: number[], finalOPos: number): string {
  let out = "";
  let lastOrig = 0;

  for (const { modelPos, tag } of tagSpots) {
    const origPos = idxMap[modelPos] ?? finalOPos;
    out += origPlain.slice(lastOrig, origPos);
    out += tag;
    lastOrig = origPos;
  }

  out += origPlain.slice(lastOrig);
  return out;
}

export function restoreOriginalTextInHtml(originalHtml: string, modelHtml: string, tolerance = 0.2): string {
  if (originalHtml === modelHtml) return modelHtml;

  const origPlain = stripHtmlTags(originalHtml);
  const { tagSpots, modelPlain } = extractTagSpots(modelHtml);

  const drift = calculateDrift(origPlain, modelPlain);
  if (drift > tolerance) return modelHtml;

  const { idxMap, finalOPos } = buildPositionMapping(modelPlain, origPlain);

  return reassemble(tagSpots, origPlain, idxMap, finalOPos);
}
