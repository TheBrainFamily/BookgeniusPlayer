import { z } from "zod";

// Per-page chapter info (a spread can have different chapters on left vs right)
export const PageChapterInfoSchema = z.object({
  pageNumber: z.number().nullable().describe("The printed page number, or null if not visible"),
  chapterNumber: z
    .number()
    .optional()
    .describe("Chapter number if this page shows a chapter marker"),
  chapterTitle: z.string().optional().describe("Chapter title if visible on this page"),
  text: z.string().describe("OCR text from this specific page"),
});

// OCR result from Gemini Vision - tracks left and right pages separately
export const OCRResultSchema = z.object({
  leftPage: PageChapterInfoSchema.describe("OCR data for the left page (verso)"),
  rightPage: PageChapterInfoSchema.describe("OCR data for the right page (recto)"),
});

export type OCRResult = z.infer<typeof OCRResultSchema>;

// Status of a single page's OCR processing
export const PageOCRResultSchema = z.object({
  pageIndex: z.number().describe("Submission order - source of truth for page sequence"),
  uploadedAt: z.string(),
  ocrCompletedAt: z.string().optional(),
  ocrStatus: z.enum(["pending", "processing", "completed", "failed"]),
  ocrResult: OCRResultSchema.optional(),
  error: z.string().optional(),
});

export type PageOCRResult = z.infer<typeof PageOCRResultSchema>;

// Session metadata
export const SessionMetadataSchema = z.object({
  sessionId: z.string(),
  bookSlug: z.string(),
  bookTitle: z.string(),
  startedAt: z.string(),
  status: z.enum(["scanning", "idle", "processing", "completed", "failed"]),
  totalPages: z.number().optional(),
  // Incremental processing progress
  lastActivityAt: z.string().optional(), // ISO timestamp of last page upload
  processedChapters: z.array(z.number()).optional(), // Chapter numbers that have been analyzed
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

// API request/response schemas
export const StartSessionRequestSchema = z.object({ bookSlug: z.string(), bookTitle: z.string() });

export const StartSessionResponseSchema = z.object({ sessionId: z.string(), bookSlug: z.string() });

export const UploadPageResponseSchema = z.object({
  pageIndex: z.number(),
  ocrStatus: z.literal("processing"),
});

// Page status in session response - ocrResult is optional (may not exist if failed/pending)
export const SessionStatusResponseSchema = z.object({
  sessionId: z.string(),
  bookSlug: z.string(),
  bookTitle: z.string(),
  status: z.string(),
  pages: z.array(
    z.object({
      pageIndex: z.number(),
      ocrStatus: z.string(),
      // OCR result fields - present when ocrStatus is "completed"
      leftPage: PageChapterInfoSchema.optional(),
      rightPage: PageChapterInfoSchema.optional(),
      error: z.string().optional(),
    }),
  ),
});

export type SessionStatusResponse = z.infer<typeof SessionStatusResponseSchema>;

// OCR prompt for Gemini
export const OCR_PROMPT = `Analyze this scanned book page spread. The image shows TWO pages side by side (left=verso, right=recto).

Extract data for EACH page separately:

**For leftPage and rightPage, provide:**
1. **pageNumber**: The printed page number (usually at corner/bottom). Return null if not visible.
2. **text**: OCR text from that specific page only. Preserve paragraph breaks with newlines.
3. **chapterNumber**: If this page shows a chapter start (e.g., "Chapter 5", "V", "CHAPTER FIVE"), extract the number.
4. **chapterTitle**: If a chapter title is visible on this page (separate from the chapter number).

IMPORTANT:
- A spread can have chapter X ending on left and chapter Y starting on right - track them separately!
- Mark unclear words with [?]
- Only set chapterNumber/chapterTitle if you see an actual chapter heading on that specific page

Return structured JSON matching the schema.`;

// ============================================
// Chapter Analysis Schemas (rolling summary + characters)
// ============================================

// Character info for a single chapter
export const ChapterCharacterSchema = z.object({
  name: z.string().describe("Character's display name"),
  slug: z.string().describe("kebab-case identifier - reuse from previous chapters if same person"),
  referenceCard: z
    .string()
    .describe("Global bio - who this person is (no spoilers). Only generate for NEW characters."),
  chapterAction: z
    .string()
    .describe("What this character does/experiences in THIS specific chapter"),
  mentioned: z.boolean().describe("Character is mentioned in this chapter"),
  speaking: z.boolean().describe("Character has dialogue in this chapter"),
});

export type ChapterCharacter = z.infer<typeof ChapterCharacterSchema>;

// Single chapter analysis result from AI
export const ChapterAnalysisSchema = z.object({
  chapterNumber: z.number(),
  summary: z.string().describe("Telegram-style summary, mention character names explicitly"),
  characters: z.array(ChapterCharacterSchema),
});

export type ChapterAnalysis = z.infer<typeof ChapterAnalysisSchema>;

// Accumulated character across all chapters
export const BookCharacterSchema = z.object({
  name: z.string(),
  slug: z.string(),
  referenceCard: z.string(),
  firstSeenChapter: z.number(),
  chaptersAppeared: z.array(z.number()),
  chaptersSpeaking: z.array(z.number()),
});

export type BookCharacter = z.infer<typeof BookCharacterSchema>;

// Full book analysis result
export const BookAnalysisSchema = z.object({
  chapters: z.array(ChapterAnalysisSchema),
  allCharacters: z.array(BookCharacterSchema),
});

export type BookAnalysis = z.infer<typeof BookAnalysisSchema>;
