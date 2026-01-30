import fs from "fs";
import type { ScenesSummariesPerChapter } from "../../tools/new-tooling/get-chapter-by-chapter-with-paragraphs-json-summary";
import { GoogleGenAI } from "@google/genai";

import { getParagraphsFromChapter } from "../../tools/createParagraphsWithPageNumbers";
import { getParagraphsFromChapterWithText } from "../../tools/getParagraphsFromChapterWithText";
import { getBookForm } from "../../tools/getBookForm";
import { getBookData } from "../../shared-books-data/getBooksData";
import * as cheerio from "cheerio";

import { FILE_TYPE } from "../../helpers/filesHelpers";
import { readBookFile } from "../../helpers/readBookFile";
import { writeBookFile } from "../../helpers/writeBookFile";
import { getBookSettings } from "../../helpers/getBookSettings";
// import { writeBookFile } from "../../helpers/writeBookFile";
// dotenv.config();

export type Document = { text: string; chapter: number; paragraphNumber: number };
export type DocumentWithEmbeddings = Document & { Embeddings: number[] };
export type BookEmbeddings = Map<number, DocumentWithEmbeddings[]>;

/**
 * Options for generateEmbeddings when called with explicit data (not from global state)
 */
export interface GenerateEmbeddingsOptions {
  /** Chapter summaries data - if not provided, reads from summaries-with-paragraphs.json */
  summaries?: ScenesSummariesPerChapter[];
  /** Book text HTML - if not provided, uses getBookData() */
  bookText?: string;
  /** Book form (play, book, etc) - if not provided, uses getBookForm() */
  bookForm?: string;
  /** Whether to write embeddings.json to file - default true */
  writeToFile?: boolean;
}

// const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY as string);
// const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });

async function computeEmbeddingsThroughHttp(document: Document): Promise<DocumentWithEmbeddings> {
  const embeddingResponse = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: [document.text],
    config: { taskType: "RETRIEVAL_DOCUMENT" },
  });
  const embeddingValues = embeddingResponse.embeddings?.[0]?.values as number[];
  return { ...document, Embeddings: embeddingValues };
}

export async function computeBatchEmbeddingsThroughHTTP(
  documents: Document[],
): Promise<DocumentWithEmbeddings[]> {
  const BATCH_SIZE = 30;
  const RETRY_DELAYS = [5000, 30000, 35000, 35000, 35000, 35000, 35000, 35000]; // Retry delays in milliseconds

  const processChunk = async (
    chunk: Document[],
    retryAttempt = 0,
  ): Promise<DocumentWithEmbeddings[]> => {
    try {
      const documentsWithEmbeddings = await Promise.all(
        chunk.map((row) => computeEmbeddingsThroughHttp(row)),
      );
      return documentsWithEmbeddings;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (retryAttempt >= RETRY_DELAYS.length) {
        throw new Error(
          `Failed to embed documents after ${RETRY_DELAYS.length} retry attempts: ${errorMessage}`,
        );
      }

      const delay = RETRY_DELAYS[retryAttempt];
      console.log(error);
      console.log(
        `Embedding failed, retrying in ${delay / 1000}s. Attempt ${retryAttempt + 1}/${RETRY_DELAYS.length}`,
      );

      // Wait for the specified delay
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (errorMessage.includes("Request payload size exceeds the limit")) {
        console.log(
          `Request payload size exceeds the limit, ${chunk
            .map((c) => `${c.chapter}P${c.paragraphNumber}: Text: ${c.text.length}`)
            .join(" ")}`,
        );
        return processChunk(
          chunk.map((c) => ({ ...c, text: c.text.slice(0, 10000) })),
          retryAttempt + 1,
        );
      } else {
        // Retry with incremented attempt count
        return processChunk(chunk, retryAttempt + 1);
      }
    }
  };

  const results: DocumentWithEmbeddings[] = [];

  // Process documents in batches of BATCH_SIZE
  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const chunk = documents.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(documents.length / BATCH_SIZE)}, documents ${
        i + 1
      }-${Math.min(i + BATCH_SIZE, documents.length)}`,
    );

    const batchResults = await processChunk(chunk);
    results.push(...batchResults);
  }

  return results;
}

function loadSummariesFromFile(): ScenesSummariesPerChapter[] {
  return JSON.parse(
    readBookFile("summaries-with-paragraphs.json", FILE_TYPE.TEMPORARY),
  ) as ScenesSummariesPerChapter[];
}

function getChapterDataFromSummaries(
  summaries: ScenesSummariesPerChapter[],
  chapter: number,
): ScenesSummariesPerChapter {
  const chapterData = summaries.find((summary) => summary.chapterSummary.chapterNumber === chapter);
  if (!chapterData) {
    throw new Error(`Chapter ${chapter} not found in summaries`);
  }
  return chapterData;
}

export const generateEmbeddings = async (
  chaptersFrom: number,
  chaptersTo: number,
  options: GenerateEmbeddingsOptions = {},
): Promise<BookEmbeddings> => {
  const { summaries, bookText, bookForm, writeToFile = true } = options;

  const allSummaries = summaries ?? loadSummariesFromFile();
  const resolvedBookText = bookText ?? getBookData().bookText;
  const resolvedBookForm = bookForm ?? getBookForm();
  const isPlay = resolvedBookForm === "play";

  const embeddingsForChapters: BookEmbeddings = new Map();

  for (let chapter = chaptersFrom; chapter <= chaptersTo; chapter++) {
    const paragraphsFromChapter = bookText
      ? getParagraphsFromChapterWithText(chapter, resolvedBookText, true, true)
      : getParagraphsFromChapter(chapter, true, true);

    const chapterData = getChapterDataFromSummaries(allSummaries, chapter);

    let speakerByIndex: Map<number, string> | null = null;
    let talkingLabelIndices: Set<number> | null = null;
    if (isPlay) {
      const { speakerMap, labelIndices } = buildSpeakerTimelineForChapter(
        chapter,
        true,
        resolvedBookText,
      );
      speakerByIndex = speakerMap;
      talkingLabelIndices = labelIndices;
    }

    const documents: Document[] = chapterData.chapterSummary.chapterBulletPoints.map(
      (bulletPoint) => {
        const renderedText = isPlay
          ? renderWithSpeakers(
              bulletPoint.paragraphNumbers,
              paragraphsFromChapter,
              speakerByIndex!,
              talkingLabelIndices!,
            )
          : bulletPoint.paragraphNumbers
              .map((p) =>
                paragraphsFromChapter
                  .filter((pfc) => pfc.dataIndex === p)
                  ?.map((pfc) => pfc.text)
                  .join(" "),
              )
              .join("\n");

        return {
          text: `<Summary>${bulletPoint.paragraphsSummary}</Summary> <Text>${renderedText}</Text>`,
          chapter,
          paragraphNumber: bulletPoint.mainParagraphNumber,
        };
      },
    );

    const pureSummariesDocuments: Document[] = chapterData.chapterSummary.chapterBulletPoints.map(
      (bulletPoint) => {
        return {
          text: `${bulletPoint.paragraphsSummary}`,
          chapter,
          paragraphNumber: bulletPoint.mainParagraphNumber,
        };
      },
    );

    const documentsWithEmbeddings = await computeBatchEmbeddingsThroughHTTP([
      ...documents,
      ...pureSummariesDocuments,
    ]);
    embeddingsForChapters.set(chapter, documentsWithEmbeddings);
  }

  if (writeToFile) {
    writeBookFile(
      "embeddings.json",
      JSON.stringify(Array.from(embeddingsForChapters.entries()), null, 2),
    );
  }

  return embeddingsForChapters;
};

export const returnEmbeddings = async () => {
  throw new Error("this is not working, leaving just in case to see what is calling it");
  console.log("Starting to compute paragraph embeddings");

  const fromChapter = 1;
  const toChapter = 5;
  let embeddingsForAllChapters: Map<number, DocumentWithEmbeddings[]> = new Map();
  try {
    const loadedEmbeddings = JSON.parse(readBookFile("embeddings.json", FILE_TYPE.TEMPORARY));

    // const loadedEmbeddings = [];
    if (loadedEmbeddings.length > 0 && loadedEmbeddings[0][1].length > 0) {
      console.log("loadedEmbeddings", loadedEmbeddings);
      embeddingsForAllChapters = new Map(loadedEmbeddings);
      console.log("File already exists, skipping generation...");
    } else {
      console.log("File exists but empty, generating...");
      embeddingsForAllChapters = await generateEmbeddings(fromChapter, toChapter);
    }
  } catch {
    try {
      embeddingsForAllChapters = JSON.parse(fs.readFileSync("data/embeddings.json", "utf8"));
    } catch {
      console.log("File does not exist, generating...");
      embeddingsForAllChapters = await generateEmbeddings(fromChapter, toChapter);
    }
  }
  return embeddingsForAllChapters;
};

if (require.main === module) {
  const bookSettings = getBookSettings();
  generateEmbeddings(
    bookSettings.startFromChapter,
    bookSettings.startFromChapter + bookSettings.numberOfChaptersToProcess - 1,
  ).then((embeddings) => {
    console.log("embeddings", embeddings.get(0)?.length);
  });
}

// Helpers

type SpeakerTimeline = { speakerMap: Map<number, string>; labelIndices: Set<number> };

function buildSpeakerTimelineForChapter(
  chapter: number,
  clean = true,
  providedBookText?: string,
): SpeakerTimeline {
  const bookText = providedBookText ?? getBookData().bookText;
  const $ = cheerio.load(bookText);

  const elements = $(`[data-chapter="${chapter}"] > *`).toArray();
  type Row = { idx: number; isLabel: boolean; slug?: string };
  const rows: Row[] = [];

  for (const elem of elements) {
    const $elem = $(elem);
    const $clone = $elem.clone();
    if (clean) {
      $clone.find("note").remove();
      $clone.find("a").remove();
    }

    const text = $clone.text().trim();
    if (!text) continue; // mirror filtering in getParagraphsFromChapterWithText

    // Detect a label paragraph: a direct child with talking="true"
    const talkingChild = $clone.children('[talking="true"]').get(0);
    // Cheerio nodes can have `.name` for tag name; fallback to `.tagName` if present
    const tagName = talkingChild ? talkingChild.name || talkingChild.tagName : undefined;
    const isLabel = Boolean(talkingChild && tagName);

    rows.push({ idx: rows.length, isLabel, slug: isLabel ? String(tagName) : undefined });
  }

  // Build starts array from label paragraphs: speech begins at label.idx + 1
  const starts: { start: number; slug: string }[] = [];
  const labelIndices = new Set<number>();
  for (const row of rows) {
    if (row.isLabel && row.slug) {
      labelIndices.add(row.idx);
      const start = row.idx + 1;
      if (start < rows.length) {
        starts.push({ start, slug: row.slug });
      }
    }
  }

  starts.sort((a, b) => a.start - b.start);
  const speakerMap = new Map<number, string>();
  for (let i = 0; i < starts.length; i++) {
    const { start, slug } = starts[i];
    const endExclusive = i + 1 < starts.length ? starts[i + 1].start : rows.length;
    for (let idx = start; idx < endExclusive; idx++) {
      speakerMap.set(idx, slug);
    }
  }

  return { speakerMap, labelIndices };
}

/**
 * Render bullet point paragraphs, injecting speaker slugs for plays.
 * - Skips label-only paragraphs (where the bullet includes a label index).
 * - Groups consecutive paragraphs by the same speaker to avoid repeating names.
 */
function renderWithSpeakers(
  paragraphNumbers: number[],
  paragraphsFromChapter: { text: string; dataIndex: number }[],
  speakerByIndex: Map<number, string>,
  talkingLabelIndices: Set<number>,
): string {
  type Group = { speaker?: string; parts: string[] };
  const groups: Group[] = [];

  for (const p of paragraphNumbers) {
    if (talkingLabelIndices.has(p)) {
      // Skip label paragraphs if they accidentally appear in the mapping
      continue;
    }
    const texts = paragraphsFromChapter.filter((pfc) => pfc.dataIndex === p).map((pfc) => pfc.text);
    if (texts.length === 0) continue;

    const speaker = speakerByIndex.get(p);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.speaker === speaker) {
      lastGroup.parts.push(texts.join(" "));
    } else {
      groups.push({ speaker, parts: [texts.join(" ")] });
    }
  }

  const rendered = groups
    .map((g) => (g.speaker ? `${g.speaker}: ${g.parts.join(" ")}` : g.parts.join(" ")))
    .join("\n");

  return rendered;
}
