#!/usr/bin/env -S node
/**
 * format-chapter-lines.ts
 * Put each *direct* child of <Chapter> on its own line, keep inner inline markup intact.
 *
 * Usage:
 *   npx tsx format-chapter-lines.ts file1.xml file2.xml           # print to stdout (one after another)
 *   npx tsx format-chapter-lines.ts --write file1.xml file2.xml   # rewrite files in place
 *   # zsh/glob:
 *   npx tsx format-chapter-lines.ts --write **
 */

import fs from "fs";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

function openTag(el: Element): string {
  let s = `<${el.tagName}`;
  const attrs = (el as Element).attributes as NamedNodeMap | undefined;
  if (attrs && attrs.length) {
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs.item(i)!;
      const val = String(a.value).replace(/"/g, "&quot;");
      s += ` ${a.name}="${val}"`;
    }
  }
  s += ">";
  return s;
}

function formatChapterElement(chapter: Element, serializer: XMLSerializer): string {
  const lines: string[] = [];
  lines.push(openTag(chapter));

  // Iterate *direct* children of <Chapter>
  const kids = (chapter as Element).childNodes as NodeListOf<ChildNode>;
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i] as Node;
    if (n.nodeType === ELEMENT_NODE) {
      // Serialize each child in full, then ensure it's one physical line
      // @ts-expect-error (works, weird xmldom typing)
      const raw = serializer.serializeToString(n);
      const oneline = raw.replace(/\r?\n\s*/g, " ");
      lines.push(`  ${oneline}`);
    } else if (n.nodeType === TEXT_NODE) {
      // If there is stray significant text (unlikely), keep it on one line
      const t = String(n.nodeValue ?? "");
      if (/\S/.test(t)) lines.push(`  ${t.trim()}`);
    } else if (n.nodeType === COMMENT_NODE) {
      lines.push(`  <!--${(n.nodeValue ?? "").trim()}-->`);
    }
  }

  lines.push(`</${chapter.tagName}>`);
  return lines.join("\n");
}

function formatSource(xml: string): string {
  const parser = new DOMParser({ onError: () => {} });
  const doc = parser.parseFromString(xml, "text/xml");
  const serializer = new XMLSerializer();

  // If the file is just one <Chapter>, format that; otherwise format all Chapters found.
  const chapters = Array.from(
    doc.getElementsByTagName("Chapter") as unknown as HTMLCollectionOf<Element>,
  );
  if (!chapters.length) return xml;

  // If the document *is* a single <Chapter> root:
  const root = doc.documentElement as Element | null;
  if (root && root.tagName === "Chapter") {
    return formatChapterElement(root, serializer) + "\n";
  }

  // Otherwise, rebuild by replacing each Chapter’s serialized block inside the whole doc string.
  let whole = serializer.serializeToString(doc);
  for (const ch of chapters) {
    // @ts-expect-error (works, weird xmldom typing)
    const orig = serializer.serializeToString(ch);
    const pretty = formatChapterElement(ch, serializer);
    // Replace all occurrences of this exact chapter block
    whole = whole.split(orig).join(pretty);
  }
  return whole + (whole.endsWith("\n") ? "" : "\n");
}

// ---------- CLI ----------
const args = process.argv.slice(2);
const write = args.includes("--write");
const files = args.filter((a) => !a.startsWith("--"));

async function run() {
  if (!files.length) {
    // stdin -> stdout
    const input = fs.readFileSync(0, "utf8");
    process.stdout.write(formatSource(input));
    return;
  }

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const out = formatSource(src);
    if (write) {
      fs.writeFileSync(file, out, "utf8");
    } else {
      process.stdout.write(out);
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
