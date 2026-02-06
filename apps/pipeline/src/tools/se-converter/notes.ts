import { JSDOM } from "jsdom";

export interface SENote {
  noteId: string;
  content: string;
}

const SE_NOTE_HREF_REGEX = /(?:^|\/)(?:endnotes|notes)\.xhtml#note-(\d+)$/i;

function removeBacklinks(container: Element): void {
  const backlinkAnchors = container.querySelectorAll(
    'a[epub\\:type="backlink"], a[data-epub-type="backlink"]',
  );

  for (const anchor of Array.from(backlinkAnchors)) {
    const parent = anchor.parentElement;
    anchor.remove();

    if (parent && parent.tagName.toLowerCase() === "p" && !(parent.textContent || "").trim()) {
      parent.remove();
    }
  }
}

function cleanupNoteContent(html: string): string {
  return html
    .replace(/\s+xmlns(:[a-z0-9]+)?="[^"]*"/gi, "")
    .replace(/\s+(ns\d+|epub):type="([^"]*)"/gi, ' data-epub-type="$2"')
    .replace(/\s+(ns\d+|epub):[a-z-]+="[^"]*"/gi, "")
    .trim();
}

export function extractSENotesFromXhtml(xhtml: string): SENote[] {
  const dom = new JSDOM(xhtml, { contentType: "application/xhtml+xml" });
  const doc = dom.window.document;

  const notes: SENote[] = [];
  const seen = new Set<string>();
  const items = doc.querySelectorAll('li[id^="note-"]');

  for (const item of Array.from(items)) {
    const rawId = item.getAttribute("id") || "";
    const match = rawId.match(/^note-(\d+)$/);
    if (!match) continue;

    const noteId = `fn${match[1]}`;
    if (seen.has(noteId)) continue;

    const clone = item.cloneNode(true) as Element;
    removeBacklinks(clone);

    const content = cleanupNoteContent(clone.innerHTML);
    if (!content) continue;

    notes.push({ noteId, content });
    seen.add(noteId);
  }

  return notes;
}

export function rewriteSeNoteRefsToDataNote(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const anchors = doc.querySelectorAll("a[href]");
  for (const anchor of Array.from(anchors)) {
    const href = anchor.getAttribute("href") || "";
    const match = href.match(SE_NOTE_HREF_REGEX);
    if (!match) continue;

    const noteNumber = match[1];
    anchor.setAttribute("data-note", noteNumber);
    anchor.removeAttribute("href");
    anchor.removeAttribute("id");
    anchor.removeAttribute("data-epub-type");
    anchor.removeAttribute("epub:type");

    const classes = new Set((anchor.getAttribute("class") || "").split(/\s+/).filter(Boolean));
    classes.add("link-note");
    anchor.setAttribute("class", Array.from(classes).join(" "));
  }

  return dom.serialize();
}
