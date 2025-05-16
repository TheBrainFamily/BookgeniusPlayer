/**
 * scripts/map-daisy-paragraphs.ts
 *
 * Usage (make sure you have ts-node or transpile first):
 *   npx ts-node scripts/map-daisy-paragraphs.ts \
 *       --html ./src/raw/daisy/Section1.xhtml \
 *       --tracks ./src/data/audiobookTracksDefined.ts \
 *       --out   ./src/data/audiobook-chapters.json
 */

import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { argv } from "process";

// ---------- CLI flags -------------------------------------------------------

interface Flags {
  html: string; // path to Daisy XHTML containing ids
  tracks: string; // path to the TS / JSON file that exports the tracks array
  out: string; // where to write the resulting JSON
}
function readFlags(): Flags {
  const flags: Partial<Flags> = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "") as keyof Flags;
    const val = argv[i + 1];
    if (key && val) flags[key] = val;
  }
  if (!flags.html || !flags.tracks || !flags.out) {
    console.error(`
Missing argument.

Required:
  --html   <file>   source Daisy xhtml
  --tracks <file>   file that exports "AudiobookTracksDefined"
  --out    <file>   output json

Example:
  npx ts-node map-daisy-paragraphs.ts --html ./daisy.xhtml --tracks ./tracks.ts --out ./audiobook-chapters.json
`);
    process.exit(1);
  }
  return flags as Flags;
}

const { html: htmlPath, tracks: tracksPath, out: outPath } = readFlags();

// ---------- Track interface ------------------------------------------------
interface Track {
  chapter: number;
  paragraph: number; // will be overwritten
  smile_id: string;
  file: string;
  "clip-begin": number;
  "clip-end": number;
  [key: string]: unknown;
}

// Wrap the main logic in an async function to use await for dynamic import
async function main() {
  // ---------- import the tracks array dynamically ----------------------------
  const tracksModule = await import(path.resolve(tracksPath));
  // Ensure AudiobookTracksDefined is correctly accessed, assuming it's a named export
  const AudiobookTracksDefined: Track[] | undefined = tracksModule.AudiobookTracksDefined || (tracksModule.default && tracksModule.default.AudiobookTracksDefined);

  if (!AudiobookTracksDefined) {
    console.error(
      `Error: AudiobookTracksDefined not found in ${tracksPath}. ` +
        `Please ensure it's exported as 'AudiobookTracksDefined'. ` +
        `Module keys: ${Object.keys(tracksModule).join(", ")}`,
    );
    process.exit(1);
  }

  // ---------- load & parse XHTML ---------------------------------------------

  const html = fs.readFileSync(path.resolve(htmlPath), "utf8");
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // The Daisy export usually wraps the real content in <div class="Section1">
  const root: Element = document.querySelector("div.Section1") ?? document.body;

  // ---------- collect meaningful top-level children --------------------------

  /**
   * A helper deciding whether an element is "empty" (only whitespace, &nbsp;, <br> …)
   * Feel free to extend the heuristic (e.g. ignore empty <span> etc.).
   */
  function isMeaningful(el: Element): boolean {
    // Any descendant multimedia / image?
    if (el.querySelector("img, video, audio, svg")) return true;

    // Plain textual check
    const text = (el.textContent ?? "")
      .replace(/\u00A0/g, "") // &nbsp;
      .replace(/\s+/g, "") // all whitespace
      .trim();

    return text.length > 0;
  }

  const meaningfulBlocks: Element[] = Array.from(root.children).filter(isMeaningful);

  // quick lookup: element → its index
  const blockIndex = new Map<Element, number>();
  meaningfulBlocks.forEach((el, idx) => blockIndex.set(el, idx));

  // ---------- main conversion -------------------------------------------------
  let currentChapter = -1; // Initialize with a value that won't match any real chapter
  let chapterRelativeParagraphIndex = 0;
  let lastProcessedAbsoluteBlockIndexInChapter = -1; // Tracks the absolute index of the block for the current chapterRelativeParagraphIndex

  const enriched: Track[] = AudiobookTracksDefined.map((original) => {
    const idSel = `[id="${original.smile_id}"]`;
    const element = document.querySelector(idSel);

    if (!element) {
      console.warn(`⚠️  No element with id=${original.smile_id} found.`);
      return { ...original, paragraph: -1 };
    }

    // nearest <p>; if none, keep the element itself (covers headings)
    const anchor = element.closest("p") ?? element;
    const absoluteBlockIndex = blockIndex.get(anchor); // Get the block's unique index in the whole document

    // Check if the anchor corresponds to a meaningful block
    if (absoluteBlockIndex === undefined) {
      console.warn(
        `⚠️  Element id=${original.smile_id} (anchor: ${anchor.tagName}${anchor.id ? "#" + anchor.id : ""}) is inside a block that was filtered out or its anchor is not in meaningfulBlocks.`,
      );
      return { ...original, paragraph: -1 };
    }

    // Chapter-based paragraph counting
    if (original.chapter !== currentChapter) {
      currentChapter = original.chapter;
      chapterRelativeParagraphIndex = 0; // Reset for new chapter
      lastProcessedAbsoluteBlockIndexInChapter = absoluteBlockIndex; // This block is the first (0th relative) of the new chapter
    } else {
      // Same chapter. Increment relative counter only if this track points to a *new* absolute block
      // compared to the absolute block that defined the current chapterRelativeParagraphIndex.
      if (absoluteBlockIndex !== lastProcessedAbsoluteBlockIndexInChapter) {
        chapterRelativeParagraphIndex++;
        lastProcessedAbsoluteBlockIndexInChapter = absoluteBlockIndex;
      }
    }

    return { ...original, paragraph: chapterRelativeParagraphIndex };
  });

  // ---------- write result ----------------------------------------------------

  fs.writeFileSync(path.resolve(outPath), JSON.stringify(enriched, null, 2), "utf8");

  console.log(`✅  Written ${enriched.length} records → ${outPath}`);
}

main().catch((error) => {
  console.error("Script failed unexpectedly:", error);
  process.exit(1);
});
