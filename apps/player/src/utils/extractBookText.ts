import type { BookContextChunk, BookContextLocation, ExtractedBookText } from "@player/types/bookContext";
import { textCacheManager } from "@player/logic/TextCacheManager";
import { useBookContentStore } from "@player/stores/bookContent.store";
import { bookIndex } from "@player/logic/BookIndex";

/**
 * Extract text from the beginning of the book up to the current location
 */
export async function extractBookTextUpToLocation(currentLocation: BookContextLocation): Promise<ExtractedBookText> {
  return extractBookText({ chapter: 1, paragraph: 1 }, currentLocation);
}

/**
 * Extract text from a specific location onwards up to another location
 */
export async function extractBookTextFromLocation(fromLocation: BookContextLocation, toLocation: BookContextLocation): Promise<ExtractedBookText> {
  return extractBookText(fromLocation, toLocation);
}

/**
 * Core extractor that composes paragraph-level chunks from the in-memory text cache.
 * Ensures cache coverage up to the `toLocation` and returns chunks inclusive of both endpoints.
 */
async function extractBookText(from: BookContextLocation, to: BookContextLocation): Promise<ExtractedBookText> {
  // Normalize invalid ranges
  const compare = (a: BookContextLocation, b: BookContextLocation) => (a.chapter === b.chapter ? a.paragraph - b.paragraph : a.chapter - b.chapter);

  if (compare(to, from) < 0) {
    return { chunks: [], totalChunks: 0 };
  }

  // Ensure cache is populated up to the 'to' location
  try {
    textCacheManager.initialize();
  } catch {}
  textCacheManager.ensureCacheUpto(to.chapter, to.paragraph);

  const { textCache } = useBookContentStore.getState();
  const chunks: BookContextChunk[] = [];

  const firstChapter = Math.max(1, from.chapter);
  const lastChapter = Math.max(firstChapter, to.chapter);

  for (let chapter = firstChapter; chapter <= lastChapter; chapter++) {
    const chapterCache = textCache[chapter] || {};
    // Determine paragraph range for this chapter
    const startPara = chapter === from.chapter ? Math.max(1, from.paragraph) : 1;
    const endPara = chapter === to.chapter ? Math.max(startPara, to.paragraph) : Math.max(bookIndex.getParagraphCount(chapter), 0);

    for (let paragraph = startPara; paragraph <= endPara; paragraph++) {
      const text = chapterCache[paragraph];
      if (typeof text === "string" && text.length > 0) {
        chunks.push({ chapter, paragraph, text });
      }
    }
  }

  return { chunks, totalChunks: chunks.length };
}
