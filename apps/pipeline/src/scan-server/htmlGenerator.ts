/**
 * HTML Generator for Scanned Books
 *
 * Generates HTML files from OCR text + AI analysis in the same format
 * as Standard Ebooks books, enabling reuse of the existing player infrastructure.
 *
 * Output format:
 *   <section data-chapter="N">
 *     <hgroup>
 *       <h2>Chapter Title</h2>
 *     </hgroup>
 *     <p data-speaker="character-slug"></p>  <!-- For each speaking character -->
 *     <p><span data-c="slug">Name</span>...</p>  <!-- All mentioned characters -->
 *     <p>Chapter text content...</p>
 *   </section>
 */

import type { DetectedChapter, ChapterDetectionResult } from "./chapterDetector";
import type { BookAnalysis, ChapterAnalysis } from "./ocrSchema";

export interface GeneratedChapterHtml {
  chapterNumber: number;
  title: string | null;
  html: string;
  paragraphCount: number;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate speaker marker elements for characters who speak in this chapter
 */
function generateSpeakerMarkers(chapterAnalysis: ChapterAnalysis | undefined): string {
  if (!chapterAnalysis) return "";

  const speakingChars = chapterAnalysis.characters.filter((c) => c.speaking);
  if (speakingChars.length === 0) return "";

  return speakingChars.map((c) => `    <p data-speaker="${c.slug}"></p>`).join("\n");
}

/**
 * Generate character mention element containing all mentioned characters
 */
function generateCharacterMentions(chapterAnalysis: ChapterAnalysis | undefined): string {
  if (!chapterAnalysis) return "";

  const mentionedChars = chapterAnalysis.characters.filter((c) => c.mentioned);
  if (mentionedChars.length === 0) return "";

  const spans = mentionedChars
    .map((c) => `<span data-c="${c.slug}">${escapeHtml(c.name)}</span>`)
    .join("");

  return `    <p>${spans}</p>`;
}

/**
 * Convert OCR text paragraphs to HTML paragraphs
 */
function textToParagraphs(text: string): string[] {
  // Split on double newlines (paragraph breaks)
  // Also handle single newlines that indicate line breaks within paragraphs
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return paragraphs.map((p) => {
    // Replace single newlines with spaces (OCR often breaks mid-sentence)
    const cleanedText = p.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    return `    <p>${escapeHtml(cleanedText)}</p>`;
  });
}

/**
 * Generate HTML for a single chapter
 */
export function generateChapterHtml(
  chapter: DetectedChapter,
  analysis: ChapterAnalysis | undefined,
): GeneratedChapterHtml {
  const lines: string[] = [];

  // Section wrapper
  lines.push(`<section data-chapter="${chapter.chapterNumber}">`);

  // Chapter header
  if (chapter.title) {
    lines.push("  <hgroup>");
    lines.push(
      `    <h2 data-epub-type="ordinal">${chapter.chapterNumber === 0 ? "Prologue" : `Chapter ${chapter.chapterNumber}`}</h2>`,
    );
    lines.push(`    <p data-epub-type="title">${escapeHtml(chapter.title)}</p>`);
    lines.push("  </hgroup>");
  } else if (chapter.chapterNumber > 0) {
    lines.push("  <hgroup>");
    lines.push(`    <h2 data-epub-type="ordinal">Chapter ${chapter.chapterNumber}</h2>`);
    lines.push("  </hgroup>");
  }

  // Speaker markers (for characters who speak in this chapter)
  const speakerMarkers = generateSpeakerMarkers(analysis);
  if (speakerMarkers) {
    lines.push(speakerMarkers);
  }

  // Character mentions (all characters mentioned in this chapter)
  const characterMentions = generateCharacterMentions(analysis);
  if (characterMentions) {
    lines.push(characterMentions);
  }

  // Combine all page text for this chapter
  const chapterText = chapter.pages
    .map((p) => p.text)
    .filter((t) => t.trim().length > 0)
    .join("\n\n");

  // Convert to paragraphs
  const paragraphs = textToParagraphs(chapterText);
  lines.push(...paragraphs);

  lines.push("</section>");

  return {
    chapterNumber: chapter.chapterNumber,
    title: chapter.title || null,
    html: lines.join("\n"),
    paragraphCount: paragraphs.length,
  };
}

/**
 * Generate HTML for all chapters in a scanned book
 */
export function generateBookHtml(
  chapterDetection: ChapterDetectionResult,
  analysis: BookAnalysis,
): GeneratedChapterHtml[] {
  const analysisMap = new Map<number, ChapterAnalysis>();
  for (const chapterAnalysis of analysis.chapters) {
    analysisMap.set(chapterAnalysis.chapterNumber, chapterAnalysis);
  }

  // Skip chapter 0 (front matter/prologue) - start from chapter 1
  return chapterDetection.chapters
    .filter((chapter) => chapter.chapterNumber > 0)
    .map((chapter) => {
      const chapterAnalysis = analysisMap.get(chapter.chapterNumber);
      return generateChapterHtml(chapter, chapterAnalysis);
    });
}

/**
 * Generate a combined HTML document with all chapters
 */
export function generateCombinedHtml(chapters: GeneratedChapterHtml[]): string {
  const lines: string[] = [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '  <meta charset="utf-8">',
    "  <title>Scanned Book</title>",
    "</head>",
    "<body>",
  ];

  for (const chapter of chapters) {
    lines.push(chapter.html);
    lines.push("");
  }

  lines.push("</body>");
  lines.push("</html>");

  return lines.join("\n");
}
