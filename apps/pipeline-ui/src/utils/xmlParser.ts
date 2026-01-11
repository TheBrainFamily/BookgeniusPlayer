export interface ChapterInfo {
  originalIndex: number;
  content: string;
  title: string;
  selected: boolean;
}

/**
 * Parse chapters from rich XML - handles nested sections correctly.
 *
 * This parser correctly handles chapters that contain nested <section> elements
 * (like Paradise Lost which has preamble and poem sections inside each chapter).
 * It uses depth counting instead of a simple regex to find the correct closing tag.
 */
export function parseChapters(xml: string): {
  preamble: string;
  chapters: ChapterInfo[];
  postamble: string;
} {
  const chapters: ChapterInfo[] = [];
  let preamble = "";

  // Find the first data-chapter section to get preamble
  const firstMatch = xml.match(/<section\s+data-chapter="/);
  if (firstMatch && firstMatch.index !== undefined) {
    preamble = xml.slice(0, firstMatch.index);
  }

  // Find all chapter section start tags
  const chapterStartRegex = /<section\s+data-chapter="(\d+)"[^>]*>/g;
  const chapterStarts: { index: number; chapterNum: number; fullMatch: string }[] = [];

  let match;
  while ((match = chapterStartRegex.exec(xml)) !== null) {
    chapterStarts.push({
      index: match.index,
      chapterNum: parseInt(match[1], 10),
      fullMatch: match[0],
    });
  }

  // For each chapter, find its proper closing tag by counting nested sections
  for (let i = 0; i < chapterStarts.length; i++) {
    const start = chapterStarts[i];
    const searchStart = start.index + start.fullMatch.length;

    // Find the matching closing </section> by counting nesting
    let depth = 1;
    let pos = searchStart;
    while (depth > 0 && pos < xml.length) {
      const nextOpen = xml.indexOf("<section", pos);
      const nextClose = xml.indexOf("</section>", pos);

      if (nextClose === -1) break; // No more closing tags

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Found an opening tag before the closing tag
        depth++;
        pos = nextOpen + 8; // Move past "<section"
      } else {
        // Found a closing tag
        depth--;
        if (depth === 0) {
          // This is the matching close tag
          const endPos = nextClose + "</section>".length;
          const content = xml.slice(start.index, endPos);

          // Extract title
          const titleMatch = content.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
          let title = titleMatch
            ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
            : `Chapter ${start.chapterNum}`;
          if (title.length > 50) title = title.slice(0, 47) + "...";

          chapters.push({
            originalIndex: start.chapterNum,
            content,
            title,
            selected: true,
          });
        }
        pos = nextClose + 10; // Move past "</section>"
      }
    }
  }

  // Get postamble (everything after last chapter section)
  let postamble = "";
  if (chapters.length > 0) {
    const lastChapter = chapters[chapters.length - 1];
    const lastChapterEnd = xml.indexOf(lastChapter.content) + lastChapter.content.length;
    postamble = xml.slice(lastChapterEnd);
  }

  return { preamble, chapters, postamble };
}

/**
 * Recompile chapters with renumbered indices.
 * Only includes selected chapters and renumbers them sequentially starting from 1.
 */
export function recompileXml(
  preamble: string,
  chapters: ChapterInfo[],
  postamble: string,
): string {
  const selectedChapters = chapters.filter((c) => c.selected);
  const reindexedChapters = selectedChapters.map((chapter, idx) => {
    // Replace the data-chapter attribute with new index
    return chapter.content.replace(/data-chapter="\d+"/, `data-chapter="${idx + 1}"`);
  });
  return preamble + reindexedChapters.join("\n") + postamble;
}
