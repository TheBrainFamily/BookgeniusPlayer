import { DOMParser } from "@xmldom/xmldom";
import type { Node } from "@xmldom/xmldom"; // Import Node type
import * as Diff from "diff"; // Import the diff library
import { readBookFile } from "../../helpers/readBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";

/**
 * Recursively extracts text content from an XML node and its children.
 * @param node The XML node to process.
 * @returns The concatenated text content.
 */
function getTextContentRecursive(node: Node): string {
  let text = "";
  if (node.nodeType === node.TEXT_NODE) {
    // It's a text node, get its value
    text += node.nodeValue || "";
  } else if (node.nodeType === node.ELEMENT_NODE) {
    // It's an element node, process its children
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        text += getTextContentRecursive(node.childNodes[i]);
      }
    }
  }
  // Ignore comments, processing instructions, etc.
  return text;
}

/**
 * Extracts, normalizes, and returns the text content of an XML string.
 * Normalization involves replacing multiple whitespace characters with single spaces
 * and trimming leading/trailing whitespace.
 * @param xmlString The XML string to parse.
 * @returns The normalized text content, or null if parsing fails.
 */
function getNormalizedTextFromXml(xmlString: string): string | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/html");

    // Check for parser errors (simple check, might need more robust error handling)
    const parserError = doc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
      console.error("Error parsing XML:", getTextContentRecursive(parserError[0]));
      return null;
    }

    // Check if documentElement is null before passing to getTextContentRecursive
    if (!doc.documentElement) {
      console.error("XML document does not have a root element.");
      return null;
    }

    const textContent = getTextContentRecursive(doc.documentElement);

    // Normalize whitespace: replace multiple spaces/newlines/tabs with a single space
    // and trim leading/trailing whitespace.
    const normalizedText = textContent.replace(/\s+/g, " ").trim();
    return normalizedText;
  } catch (error) {
    console.error("Exception during XML parsing:", error);
    return null;
  }
}

/**
 * Splits a text string into sentences based on punctuation followed by whitespace.
 * Tries to handle common sentence-ending punctuation (.?!).
 * @param text The text to split.
 * @returns An array of sentences.
 */
function splitIntoSentences(text: string): string[] {
  if (!text) {
    return [];
  }
  // Split by sentence-ending punctuation followed by whitespace.
  // Use positive lookbehind (?<=...) to keep the punctuation with the sentence.
  // Handles potential multiple spaces after punctuation.
  // Trim whitespace from each resulting sentence and filter out any empty strings.
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences;
}

/**
 * Compares the normalized text content of two XML strings.
 * @param originalXml The original XML string.
 * @param modifiedXml The modified XML string (e.g., after LLM processing).
 * @returns True if the normalized text content is identical, false otherwise.
 */
export function compareXmlTextContent(originalXml: string, modifiedXml: string): boolean {
  console.log("Comparing XML text content...");

  const originalText = getNormalizedTextFromXml(`<Chapter>${originalXml}</Chapter>`);
  const modifiedText = getNormalizedTextFromXml(`<Chapter>${modifiedXml}</Chapter>`);

  // console.log("\nOriginal Normalized Text:");
  // console.log(`"${originalText}"`);
  // console.log("\nModified Normalized Text:");
  // console.log(`"${modifiedText}"`);

  if (originalText === null || modifiedText === null) {
    console.error("Comparison failed due to parsing errors.");
    return false; // Or handle error differently
  }

  if (originalText === modifiedText) {
    console.log("\n✅ Text content is identical.");
    return true;
  } else {
    console.log("\n❌ Text content differs.");

    const originalSentences = splitIntoSentences(originalText);
    const modifiedSentences = splitIntoSentences(modifiedText);

    const sentenceDiff = Diff.diffArrays(originalSentences, modifiedSentences);

    let identicalCount = 0;
    let lastRemovedSentences: string[] | null = null;

    console.log("--- Diff Start ---"); // Marker for diff output start

    sentenceDiff.forEach((part) => {
      if (part.removed) {
        // If there were previous removed sentences waiting, print them first.
        if (lastRemovedSentences) {
          if (identicalCount > 0) {
            console.log(`\x1b[90m[... ${identicalCount} identical sentence(s) ... ]\x1b[0m`);
            identicalCount = 0;
          }
          lastRemovedSentences.forEach((sentence) => console.log(`\x1b[31m- ${sentence}\x1b[0m`));
        }
        lastRemovedSentences = part.value as string[]; // Type assertion
      } else if (part.added) {
        if (identicalCount > 0) {
          console.log(`\x1b[90m[... ${identicalCount} identical sentence(s) ... ]\x1b[0m`);
          identicalCount = 0;
        }

        if (lastRemovedSentences) {
          // Removed block followed by added block: Show word-level diff
          const removedText = lastRemovedSentences.join(" "); // Join sentences for diffing
          const addedText = (part.value as string[]).join(" "); // Type assertion and join
          const wordDiff = Diff.diffWords(removedText, addedText);

          process.stdout.write("~ "); // Indicate modified block
          wordDiff.forEach((wordPart) => {
            const color = wordPart.added
              ? "\x1b[32m" // green
              : wordPart.removed
                ? "\x1b[31m" // red
                : "\x1b[90m"; // Use dim grey for unchanged words within the diff
            process.stdout.write(color + wordPart.value + "\x1b[0m"); // reset color
          });
          console.log(); // New line after word diff

          lastRemovedSentences = null; // Consumed the removed part
        } else {
          // Purely added sentences (no preceding removed block)
          (part.value as string[]).forEach((sentence) => console.log(`\x1b[32m+ ${sentence}\x1b[0m`)); // Type assertion
        }
      } else {
        // Identical part (part.added and part.removed are false)
        // If there were pending removed sentences, they will be printed
        // before the *next* added block or at the end of the loop.
        // For now, just ensure they are cleared if we hit an identical block *after* them.
        if (lastRemovedSentences) {
          // Clear pending removed sentences as we have hit an identical block.
          // They might be printed later if another added/removed block follows,
          // or at the very end if this is the last block.
          // This simplification avoids the complex type issue in this specific block.
          // We no longer print them *immediately* here.
          lastRemovedSentences = null;
        }
        // Accumulate count of identical sentences
        identicalCount += part.count || 0;
      }
    });

    // After the loop, handle any remaining parts
    if (lastRemovedSentences) {
      // Handle any trailing removed block
      if (identicalCount > 0) {
        console.log(`\x1b[90m[... ${identicalCount} identical sentence(s) ... ]\x1b[0m`);
      }
      (lastRemovedSentences as string[]).forEach((sentence: string) => console.log(`\x1b[31m- ${sentence}\x1b[0m`));
    } else if (identicalCount > 0) {
      // Handle trailing identical block
      console.log(`\x1b[90m[... ${identicalCount} identical sentence(s) ... ]\x1b[0m`);
    }

    console.log("--- Diff End ---"); // Marker for diff output end

    console.log(); // Ensure a newline after the diff output

    return false;
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   0.  Fast exits
   ─────────────────────────────────────────────────────────────────────── */
export function restoreOriginalText(
  originalXml: string,
  modelXml: string,
  tagNames: string[],
  tolerance = 1, // ≤ 0.1 % drift is auto-patched
): string {
  if (originalXml === modelXml) return modelXml;
  if (tagNames.length === 0) return modelXml; // nothing to restore

  /* ──────────────────────────────────────────────────────────────────────
     1.  Build one regex that matches any of our tags
     ─────────────────────────────────────────────────────────────────── */
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagRe = new RegExp(`<\\/?(?:${tagNames.map(esc).join("|")})(?:\\s[^>]*?)?>`, "g");

  /* ──────────────────────────────────────────────────────────────────────
     2.  Extract (a) the plain text of the model,
               (b) an ordered list of { modelPos, tag }
            modelPos = # plain characters seen *before* that tag
     ─────────────────────────────────────────────────────────────────── */
  type TagSpot = { modelPos: number; tag: string };
  const tagSpots: TagSpot[] = [];
  let modelPlain = "";
  let cursor = 0;

  for (const m of modelXml.matchAll(tagRe)) {
    const idx = m.index!;
    modelPlain += modelXml.slice(cursor, idx); // accumulate plain text
    tagSpots.push({ modelPos: modelPlain.length, tag: m[0] });
    cursor = idx + m[0].length;
  }
  modelPlain += modelXml.slice(cursor);

  /* counterpart from original (no tags) */
  const origPlain = originalXml.replace(tagRe, "");

  /* ──────────────────────────────────────────────────────────────────────
     3.  How different are they?
     ─────────────────────────────────────────────────────────────────── */
  const deltaChars = Diff.diffChars(origPlain, modelPlain)
    .filter((p) => p.added || p.removed)
    .reduce((n, p) => n + p.value.length, 0);

  if (deltaChars / origPlain.length > tolerance) return modelXml; // let caller retry

  /* ──────────────────────────────────────────────────────────────────────
     4.  Build a mapping: for every index *i* in modelPlain tell me the
         corresponding index in origPlain.
         We walk a diff from left to right keeping two cursors.
     ─────────────────────────────────────────────────────────────────── */
  const idxMap: number[] = []; // idxMap[i] = where char i of modelPlain
  //            lives inside origPlain
  let mPos = 0,
    oPos = 0;

  Diff.diffChars(modelPlain, origPlain).forEach((part) => {
    if (part.added) {
      // exists only in orig → advance *orig* cursor
      oPos += part.value.length;
    } else if (part.removed) {
      // exists only in model
      for (let i = 0; i < part.value.length; i++, mPos++) {
        // map the “extra” char to last valid orig position (safe because drift tiny)
        idxMap[mPos] = oPos;
      }
    } else {
      // unchanged block
      for (let i = 0; i < part.value.length; i++, mPos++, oPos++) {
        idxMap[mPos] = oPos;
      }
    }
  });

  /* ──────────────────────────────────────────────────────────────────────
     5.  Re-assemble:
         text always from *origPlain*; tags exactly where the model put them
     ─────────────────────────────────────────────────────────────────── */
  let out = "";
  let lastOrig = 0;

  for (const { modelPos, tag } of tagSpots) {
    const origPos = idxMap[modelPos] ?? oPos; // fallback: end of string
    out += origPlain.slice(lastOrig, origPos); // chunk of pristine text
    out += tag; // the tag itself
    lastOrig = origPos;
  }
  out += origPlain.slice(lastOrig); // tail

  return out;
}

if (require.main === module) {
  // const original = fs.readFileSync(
  //   "/Users/lukaszgandecki/projects/convert-books-trump/books-data/conrad-tajny-agent/temporary-output/rewritten-paragraphs-for-chapter-original-6.xml",
  //   "utf8",
  // );
  // const changed = fs.readFileSync(
  //   "/Users/lukaszgandecki/projects/convert-books-trump/books-data/conrad-tajny-agent/temporary-output/rewritten-paragraphs-for-chapter-broken-6-callGeminiWrapper.xml",
  //   "utf8",
  // );
  // const allCharacters = JSON.parse(readBookFile("single-summary-per-person.json", FILE_TYPE.PERMANENT)) as {
  //   characters: { name: string }[];
  // };

  // const original = fs.readFileSync(
  //   "/Users/dominiklasek/Documents/BookGenius/bookgenius-server/books-data/macbeth/input/old.fb2",
  //   "utf-8",
  // );
  // const changed = fs.readFileSync(
  //   "/Users/dominiklasek/Documents/BookGenius/bookgenius-server/books-data/macbeth/input/new.fb2",
  //   "utf-8",
  // );

  // const allCharactersNames = allCharacters.characters.map((c) => generateTagName(c.name)) as string[];
  // const restored = restoreOriginalText(original, changed, allCharactersNames);

  // Test the function with both original and changed XML

  Array.from({ length: 19 }, (_, i) => i + 21).forEach((chapter) => {
    console.log(`Comparing chapter ${chapter}`);
    const original = readBookFile(`original-paragraphs-for-chapter-${chapter}.xml`, FILE_TYPE.TEMPORARY);
    const changed = readBookFile(`rewritten-paragraphs-for-chapter-${chapter}.xml`, FILE_TYPE.TEMPORARY);
    compareXmlTextContent(original, changed);
  });

  // console.log("compare with restored");
  // compareXmlTextContent(original, restored);

  console.log("compared everything");
  // compareXmlTextContent(original, original); // Keep this line if you want to test the identical case too
}
