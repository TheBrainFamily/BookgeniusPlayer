#!/usr/bin/env ts-node
/**
 * strip-xml.ts – convert chapter XML to clean plain text
 *
 * Usage
 *   tsx strip-xml.ts chapter2.xml      # read from a file
 *   cat chapter2.xml | ts-node strip-xml.ts   # read from stdin
 */

import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";

/* ------------------------------------------------------------------ */
/*  Core converter                                                     */
/* ------------------------------------------------------------------ */

/**
 * Remove all markup, skip standalone speaker-name lines,
 * and return readable plain text.
 */
export function xmlToPlainText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "text/xml");

  /** Tags that should force line-breaks before/after. */
  const isBlock = (tag: string | null) => !!tag && /^(p|h\d|act|chapter|div|br)$/i.test(tag);

  /**
   * Detect a “speaker-label” paragraph, e.g.
   *   <p><Sampson talking="true"/><strong>SAMPSON</strong></p>
   * We skip these entirely.
   */
  const isSpeakerLine = (el: Element): boolean => {
    if (el.tagName.toLowerCase() !== "p") return false;

    /* 1 . any descendant with talking="true" */
    let talking = false;
    const desc = el.getElementsByTagName("*");
    for (let i = 0; i < desc.length; i++) {
      if (desc[i].getAttribute("talking") === "true") {
        talking = true;
        break;
      }
    }
    if (!talking) return false;

    /* 2 . visible text is only inside <strong> */
    if (el.getElementsByTagName("strong").length === 0) return false;
    const clone = el.cloneNode(true) as Element;
    Array.from(clone.getElementsByTagName("strong")).forEach((s) => s.parentNode?.removeChild(s));
    return clone.textContent?.trim() === "";
  };

  /* ---- streamed output builder (prevents phantom spaces) ----------- */
  let out = "";

  /** Append chunk, collapsing any “double spaces” at the join. */
  const append = (chunk: string) => {
    if (!chunk) return;
    if (out && /\s$/.test(out) && /^\s/.test(chunk)) {
      chunk = chunk.replace(/^\s+/, ""); // drop leading blanks in chunk
    }
    out += chunk;
  };

  /** Depth-first walk. */
  const walk = (node: Node): void => {
    if (node.nodeType === 1) {
      const el = node as Element;
      if (isSpeakerLine(el)) return;

      const tag = el.tagName;
      if (isBlock(tag)) append("\n");

      for (let c = node.firstChild; c; c = c.nextSibling) walk(c);

      if (isBlock(tag)) append("\n");
    } else if (node.nodeType === 3) {
      // Compress internal whitespace but keep leading/trailing spaces.
      const txt = node.nodeValue?.replace(/\s+/g, " ");
      if (txt) append(txt);
    }
  };

  // @ts-expect-error(correct usage, wrong types)
  walk(doc.documentElement);

  /* Final tidy-ups. */
  return out
    .replace(/ *\n */g, "\n") // trim spaces around newlines
    .replace(/\n{2,}/g, "\n") // collapse blank lines
    .replace(/ {2,}/g, " ") // squeeze runs of spaces
    .trim();
}

/* ------------------------------------------------------------------ */
/*  CLI driver                                                         */
/* ------------------------------------------------------------------ */

if (require.main === module) {
  const path = process.argv[2];
  const xml = path ? readFileSync(path, "utf-8") : readFileSync(0, "utf-8");
  console.log(xmlToPlainText(xml));
}
