export interface ChapterInfo {
  originalIndex: number;
  title: string;
  content: string; // For display in editor
  selected: boolean;
}

/**
 * Parse chapters from XML using DOM parsing.
 *
 * Returns the original XML string and extracted chapter info.
 * The original XML is preserved for recompilation - no string manipulation needed.
 */
export function parseChapters(xml: string): { originalXml: string; chapters: ChapterInfo[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  // Find all chapter sections
  const chapterSections = doc.querySelectorAll("section[data-chapter]");

  const chapters: ChapterInfo[] = [];
  for (const section of chapterSections) {
    const chapterNum = parseInt(section.getAttribute("data-chapter") || "0", 10);

    // Extract title from first heading
    const heading = section.querySelector("h1, h2, h3, h4, h5, h6");
    let title = heading
      ? heading.textContent?.trim() || `Chapter ${chapterNum}`
      : `Chapter ${chapterNum}`;
    if (title.length > 50) title = title.slice(0, 47) + "...";

    // Serialize chapter content for editor display
    const serializer = new XMLSerializer();
    const content = serializer.serializeToString(section);

    chapters.push({ originalIndex: chapterNum, title, content, selected: true });
  }

  return { originalXml: xml, chapters };
}

/**
 * Recompile XML with chapter modifications using pure DOM manipulation.
 *
 * - Removes unselected chapters
 * - Renumbers remaining chapters sequentially (1, 2, 3, ...)
 * - Preserves all document structure, attributes, and non-chapter content
 */
export function recompileXml(originalXml: string, chapters: ChapterInfo[]): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(originalXml, "text/xml");

  // Find all chapter sections in DOM order
  const chapterSections = doc.querySelectorAll("section[data-chapter]");

  // Build a map of originalIndex -> selected status
  const selectionMap = new Map<number, boolean>();
  for (const chapter of chapters) {
    selectionMap.set(chapter.originalIndex, chapter.selected);
  }

  // Track new chapter number for renumbering
  let newChapterNum = 1;

  // Process each chapter section
  for (const section of chapterSections) {
    const originalIndex = parseInt(section.getAttribute("data-chapter") || "0", 10);
    const isSelected = selectionMap.get(originalIndex) ?? true;

    if (isSelected) {
      // Renumber the chapter
      section.setAttribute("data-chapter", String(newChapterNum));
      newChapterNum++;
    } else {
      // Remove unselected chapter from DOM
      section.parentNode?.removeChild(section);
    }
  }

  // Serialize back to string
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}
