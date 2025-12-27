import fs from "fs";
import type { ScenesSummariesPerChapter } from "../../tools/new-tooling/get-chapter-by-chapter-with-paragraphs-json-summary";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";

import dotenv from "dotenv";
import { getParagraphsFromChapter } from "../../tools/createParagraphsWithPageNumbers";
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

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
// const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function computeEmbeddingsThroughHttp(document: Document): Promise<DocumentWithEmbeddings> {
  const embeddingResponse = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: [document.text],
    config: { taskType: "RETRIEVAL_DOCUMENT" },
  });
  const embeddingValues = embeddingResponse.embeddings?.[0]?.values as number[];
  return { ...document, Embeddings: embeddingValues };
}

export async function computeBatchEmbeddingsThroughHTTP(documents: Document[]): Promise<DocumentWithEmbeddings[]> {
  const BATCH_SIZE = 30;
  const RETRY_DELAYS = [5000, 30000, 35000, 35000, 35000, 35000, 35000, 35000]; // Retry delays in milliseconds

  const processChunk = async (chunk: Document[], retryAttempt = 0): Promise<DocumentWithEmbeddings[]> => {
    try {
      const documentsWithEmbeddings = await Promise.all(chunk.map((row) => computeEmbeddingsThroughHttp(row)));
      return documentsWithEmbeddings;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (retryAttempt >= RETRY_DELAYS.length) {
        throw new Error(`Failed to embed documents after ${RETRY_DELAYS.length} retry attempts: ${errorMessage}`);
      }

      const delay = RETRY_DELAYS[retryAttempt];
      console.log(error);
      console.log(`Embedding failed, retrying in ${delay / 1000}s. Attempt ${retryAttempt + 1}/${RETRY_DELAYS.length}`);

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

const allSummaries = JSON.parse(
  readBookFile("summaries-with-paragraphs.json", FILE_TYPE.TEMPORARY),
) as ScenesSummariesPerChapter[];
// const allSummaries = [];
const getChapterData = async (chapter: number) => {
  const chapterData = allSummaries.find((summary) => summary.chapterSummary.chapterNumber === chapter);
  if (!chapterData) {
    throw new Error(`Chapter ${chapter} not found`);
  }
  return chapterData;
};

const generateEmbeddings = async (chaptersFrom: number, chaptersTo: number) => {
  const embeddingsForChapters: Map<number, DocumentWithEmbeddings[]> = new Map();

  for (let chapter = chaptersFrom; chapter <= chaptersTo; chapter++) {
    const paragraphsFromChapter: { text: string; dataIndex: number }[] = getParagraphsFromChapter(chapter, true, true);
    const chapterData = await getChapterData(chapter);
    // If the book form is a play, compute speaker timeline for this chapter and
    // inject speaker slugs before speech runs. Otherwise, keep existing behavior.
    const isPlay = getBookForm() === "play";

    // Build speaker timeline per chapter (only for plays)
    let speakerByIndex: Map<number, string> | null = null;
    let talkingLabelIndices: Set<number> | null = null;
    if (isPlay) {
      const { speakerMap, labelIndices } = buildSpeakerTimelineForChapter(chapter, true);
      speakerByIndex = speakerMap;
      talkingLabelIndices = labelIndices;
    }

    const documents: Document[] = chapterData.chapterSummary.chapterBulletPoints.map((bulletPoint) => {
      // Render text either with speaker labels (for plays) or as plain concatenated text
      const renderedText = isPlay
        ? renderWithSpeakers(bulletPoint.paragraphNumbers, paragraphsFromChapter, speakerByIndex!, talkingLabelIndices!)
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
        chapter: chapter,
        paragraphNumber: bulletPoint.mainParagraphNumber,
      };
    });
    const pureSummariesDocuments: Document[] = chapterData.chapterSummary.chapterBulletPoints.map((bulletPoint) => {
      return {
        text: `${bulletPoint.paragraphsSummary}`,
        chapter: chapter,
        paragraphNumber: bulletPoint.mainParagraphNumber,
      };
    });
    const documentsWithEmbeddings = await computeBatchEmbeddingsThroughHTTP([...documents, ...pureSummariesDocuments]);
    embeddingsForChapters.set(chapter, documentsWithEmbeddings);
  }

  writeBookFile("embeddings.json", JSON.stringify(Array.from(embeddingsForChapters.entries()), null, 2));

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

/**
 * Build a map of paragraph index -> active speaker slug for a given chapter.
 * The logic mirrors indexing semantics of getParagraphsFromChapter(chapter, true, true):
 * - Iterate Chapter children in DOM order.
 * - Clean notes/anchors, derive pure text, and only keep non-empty paragraphs.
 * - Paragraphs that contain a direct child tag with talking="true" mark a speaker label paragraph.
 *   Speech starts at the following paragraph (index+1) and continues until the next label.
 */
function buildSpeakerTimelineForChapter(chapter: number, clean = true): SpeakerTimeline {
  const { bookText } = getBookData();
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
    const talkingChild = $clone.children('[talking="true"]').get(0) as any | undefined;
    // Cheerio nodes can have `.name` for tag name; fallback to `.tagName` if present
    const tagName = talkingChild ? talkingChild.name || (talkingChild as any).tagName : undefined;
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

  const rendered = groups.map((g) => (g.speaker ? `${g.speaker}: ${g.parts.join(" ")}` : g.parts.join(" "))).join("\n");

  return rendered;
}
