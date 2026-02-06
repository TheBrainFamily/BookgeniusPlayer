import { readdir } from "node:fs/promises";
import { join } from "node:path";

export type BookCategory = "FULL_PLAY" | "EMBEDDED_DRAMA" | "DIALOGUE_ONLY";

export interface BookAnalysis {
  slug: string;
  category: BookCategory;
  hasDramatisPersonae: boolean;
  hasActFiles: boolean;
  hasSceneSections: boolean;
  hasDramaTables: boolean;
  hasBodyDramaType: boolean;
  actCount: number;
  dramaTables: number;
  regularParagraphs: number;
  notes: string[];
}

const DEFAULT_BOOKS_DIR = join(import.meta.dir, "../../../standardebooks-data/books");

function includesDramaBodyType(content: string): boolean {
  const bodyMatch = content.match(/<body[^>]*epub:type=(['"])([^'"]+)\1/);
  if (!bodyMatch) return false;
  return bodyMatch[2].split(/\s+/).includes("z3998:drama");
}

// eslint-disable-next-line complexity
export async function analyzeBook(
  bookSlug: string,
  booksDir: string = DEFAULT_BOOKS_DIR,
): Promise<BookAnalysis | null> {
  const textDir = join(booksDir, bookSlug, "text");

  try {
    const files = await readdir(textDir);
    const xhtmlFiles = files.filter((f) => f.endsWith(".xhtml"));

    const analysis: BookAnalysis = {
      slug: bookSlug,
      category: "DIALOGUE_ONLY",
      hasDramatisPersonae: files.includes("dramatis-personae.xhtml"),
      hasActFiles: files.some((f) => /^act-\d+\.xhtml$/.test(f)),
      hasSceneSections: false,
      hasDramaTables: false,
      hasBodyDramaType: false,
      actCount: files.filter((f) => /^act-\d+\.xhtml$/.test(f)).length,
      dramaTables: 0,
      regularParagraphs: 0,
      notes: [],
    };

    let hasAnyDramaContent = false;

    for (const file of xhtmlFiles) {
      const content = await Bun.file(join(textDir, file)).text();

      if (!analysis.hasBodyDramaType && includesDramaBodyType(content)) {
        analysis.hasBodyDramaType = true;
        hasAnyDramaContent = true;
      }

      const dramaTableMatches = content.match(/<table[^>]*epub:type="z3998:drama"/g);
      if (dramaTableMatches) {
        analysis.dramaTables += dramaTableMatches.length;
        analysis.hasDramaTables = true;
        hasAnyDramaContent = true;
      }

      if (
        content.includes('epub:type="z3998:scene"') ||
        content.includes("epub:type='z3998:scene'")
      ) {
        analysis.hasSceneSections = true;
        hasAnyDramaContent = true;
      }

      if (
        ![
          "dramatis-personae.xhtml",
          "endnotes.xhtml",
          "colophon.xhtml",
          "imprint.xhtml",
          "titlepage.xhtml",
          "halftitlepage.xhtml",
        ].includes(file)
      ) {
        const paragraphs = content.match(/<p[^>]*>/g);
        if (paragraphs) {
          analysis.regularParagraphs += paragraphs.length;
        }
      }

      if (content.includes('epub:type="z3998:stage-direction"')) {
        hasAnyDramaContent = true;
      }
    }

    if (
      !hasAnyDramaContent &&
      !analysis.hasDramatisPersonae &&
      !analysis.hasActFiles &&
      !analysis.hasBodyDramaType
    ) {
      return null;
    }

    if (
      analysis.hasDramatisPersonae &&
      analysis.hasActFiles &&
      (analysis.hasSceneSections || analysis.hasBodyDramaType)
    ) {
      analysis.category = "FULL_PLAY";
      analysis.notes.push("Classic play structure");
    } else if (analysis.hasDramatisPersonae && analysis.hasActFiles) {
      analysis.category = "FULL_PLAY";
      analysis.notes.push("Has acts and dramatis-personae");
    } else if (analysis.hasSceneSections && analysis.actCount > 0) {
      analysis.category = "FULL_PLAY";
      analysis.notes.push("Scene-based structure");
    } else if (analysis.hasBodyDramaType && analysis.hasActFiles) {
      analysis.category = "FULL_PLAY";
      analysis.notes.push("Body marked as drama with acts");
    } else if (analysis.hasDramaTables) {
      if (analysis.regularParagraphs > 100 && analysis.dramaTables < 20) {
        analysis.category = "EMBEDDED_DRAMA";
        analysis.notes.push(
          `${analysis.dramaTables} drama tables in ${analysis.regularParagraphs} paragraphs of prose`,
        );
      } else if (analysis.dramaTables > 50) {
        analysis.category = "FULL_PLAY";
        analysis.notes.push("Primarily drama tables");
      } else {
        analysis.category = "EMBEDDED_DRAMA";
        analysis.notes.push(`Mixed content: ${analysis.dramaTables} drama sections`);
      }
    } else if (analysis.hasDramatisPersonae || analysis.hasBodyDramaType) {
      analysis.category = "FULL_PLAY";
      analysis.notes.push("Has dramatis-personae or drama body type");
    } else {
      analysis.category = "DIALOGUE_ONLY";
      analysis.notes.push("Uses persona markup but not structured drama");
    }

    return analysis;
  } catch {
    return null;
  }
}

export async function classifyDramaBooks(
  bookSlugs: string[],
  booksDir: string = DEFAULT_BOOKS_DIR,
): Promise<BookAnalysis[]> {
  const results: BookAnalysis[] = [];
  for (const slug of bookSlugs) {
    const analysis = await analyzeBook(slug, booksDir);
    if (analysis) results.push(analysis);
  }
  return results;
}
