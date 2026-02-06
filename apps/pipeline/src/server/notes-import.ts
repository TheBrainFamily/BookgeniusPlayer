import { JSDOM } from "jsdom";

export interface ReferencedNote {
  noteId: string;
  chapter: number;
}

export function normalizeNoteRefId(rawId: string): string | null {
  const value = rawId.trim();
  if (!value) return null;

  const fnMatch = value.match(/^fn(\d+)$/i);
  if (fnMatch) return `fn${fnMatch[1]}`;

  const noteMatch = value.match(/^note-(\d+)$/i);
  if (noteMatch) return `fn${noteMatch[1]}`;

  const numberMatch = value.match(/^(\d+)$/);
  if (numberMatch) return `fn${numberMatch[1]}`;

  return null;
}

export function collectReferencedNoteIdsByChapter(richXml: string): ReferencedNote[] {
  const refs: ReferencedNote[] = [];
  const seen = new Set<string>();

  const dom = new JSDOM(richXml, { contentType: "application/xml" });
  const doc = dom.window.document;

  const sections = doc.querySelectorAll("section[data-chapter]");
  for (const section of Array.from(sections)) {
    const chapterValue = section.getAttribute("data-chapter");
    const chapter = chapterValue ? parseInt(chapterValue, 10) : NaN;
    if (Number.isNaN(chapter)) continue;

    const noteRefs = section.querySelectorAll("a[data-note], note[id]");
    for (const noteRef of Array.from(noteRefs)) {
      const isAnchor = noteRef.tagName.toLowerCase() === "a";
      const rawId = isAnchor
        ? noteRef.getAttribute("data-note") || ""
        : noteRef.getAttribute("id") || "";
      const noteId = normalizeNoteRefId(rawId);
      if (!noteId || seen.has(noteId)) continue;

      refs.push({ noteId, chapter });
      seen.add(noteId);
    }
  }

  return refs;
}

export function buildNotesToUploadFromNoteMap(args: {
  bookPath: string;
  richXml: string;
  noteMap: Map<string, string>;
}): { bookPath: string; noteId: string; content: string; chapter: number }[] {
  const references = collectReferencedNoteIdsByChapter(args.richXml);

  return references
    .map((ref) => {
      const content = args.noteMap.get(ref.noteId);
      if (!content) return null;
      return { bookPath: args.bookPath, noteId: ref.noteId, content, chapter: ref.chapter };
    })
    .filter(
      (note): note is { bookPath: string; noteId: string; content: string; chapter: number } =>
        Boolean(note),
    );
}
