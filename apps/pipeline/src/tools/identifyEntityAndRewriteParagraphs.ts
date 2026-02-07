import { callGeminiWrapper, callGeminiVertexWrapper } from "../callClaude";
import { getChapterParagraphsAndSectionAttributes } from "./createParagraphsWithPageNumbers";
import { logger } from "../logger";
import fs from "fs";
import { compareXmlTextContent } from "./new-tooling/compare-chapters-xml";
import { restoreOriginalTextInHtml } from "./new-tooling/restore-text-in-html";
import { restoreUnwrappedLines } from "./new-tooling/restore-unwrapped-lines";
import { sanitizeNestedParagraphs } from "./new-tooling/sanitize-nested-paragraphs";
import path from "path";
import { type NewReferenceCardsResponse } from "../types";
import { writeBookFile } from "../helpers/writeBookFile";
import { getBookSettings } from "../helpers/getBookSettings";
import { FILE_TYPE } from "../helpers/filesHelpers";
import { readBookFile } from "../helpers/readBookFile";
import { generateTagName } from "../helpers/generateTagName";
import { getChapterFormat } from "./getChapterFormat";
import { doesBookFileExist } from "../helpers/readBookFile";
import { callGpt5 } from "../callO3";
import { abortableSleep, checkAborted, isAbortError } from "../helpers/abortHelpers";
import {
  needsChunking,
  chunkParagraphs,
  buildChunkXml,
  buildParagraphXml,
  combineChunks,
  type Paragraph,
  type ChapterChunk,
} from "./chapterChunker";
import { callGrok } from "../callGrok";

const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;
const CHAPTER_SCAN_LOG_EVERY = Number.parseInt(
  process.env.REWRITE_CHAPTER_SCAN_LOG_EVERY || "25",
  10,
);
const CHAPTER_SCAN_SLOW_MS = Number.parseInt(process.env.REWRITE_CHAPTER_SCAN_SLOW_MS || "500", 10);

function getRetryDelayMs(attempt: number): number {
  if (attempt <= 0) return 0;
  return RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
}

/**
 * Build the XML characters string for the prompt
 */
function buildJsonCharacters(charactersForChapter: { name: string; summary: string }[]): string {
  return JSON.stringify(
    charactersForChapter.map((entity) => ({
      id: generateTagName(entity.name.trim()),
      name: entity.name.trim(),
      description: entity.summary.trim(),
    })),
    null,
    2,
  );
}

/**
 * Build the prompt for a chunk, optionally including previous context
 */
function buildChunkedPrompt(
  paragraphs: Paragraph[],
  _chapterId: number,
  jsonCharacters: string,
  previousChunkOutput: string | null,
): string {
  const prompt = fs.readFileSync(
    path.join(__dirname, "NewRewriteParagraphsPromptBookChunked.md"),
    "utf8",
  );

  const paragraphsXml = paragraphs.map(buildParagraphXml).join("\n");

  let previousContextSection = "";
  let outputOnlyInstruction = "";

  if (previousChunkOutput) {
    previousContextSection = `
## CONTEXT FROM PREVIOUS SECTION

The following is the PREVIOUS section of this chapter. Use it ONLY as context to understand who is speaking and character references. DO NOT include this section in your output.

<PreviousContext>
${previousChunkOutput}
</PreviousContext>

**IMPORTANT:** Your output should ONLY contain the paragraphs from the "### Text Content" section below. Do NOT include any paragraphs from the PreviousContext section.
`;
    outputOnlyInstruction = `
**OUTPUT ONLY THE "### Text Content" SECTION. Do NOT include the PreviousContext in your output.**
`;
  }

  return prompt
    .replace("{{paragraphs_html}}", paragraphsXml)
    .replace("{{characters_json}}", jsonCharacters)
    .replace("{{previousContextSection}}", previousContextSection)
    .replace("{{outputOnlyInstruction}}", outputOnlyInstruction);
}

/**
 * Process a single chunk with optional context from previous chunk
 */
type ProcessChunkOptions = { attempt?: number; signal?: AbortSignal };

async function processChunk(
  chapter: number,
  chunkIndex: number,
  chunk: ChapterChunk,
  jsonCharacters: string,
  previousChunkOutput: string | null,
  options: ProcessChunkOptions = {},
): Promise<string> {
  const { attempt = 0, signal } = options;
  checkAborted(signal, `chapter ${chapter} chunk ${chunkIndex}`);
  const chunkFileName = `rewritten-paragraphs-for-chapter-${chapter}-chunk-${chunkIndex}.xml`;

  // Check if chunk already processed
  if (doesBookFileExist(chunkFileName, FILE_TYPE.TEMPORARY)) {
    logger.info(`✅ Chunk ${chunkIndex} already rewritten for chapter ${chapter}`);
    return readBookFile(chunkFileName, FILE_TYPE.TEMPORARY);
  }

  if (attempt > 0) {
    await abortableSleep(getRetryDelayMs(attempt), signal);
  }
  if (attempt > 5) {
    logger.error(`❌ Too many attempts for chapter ${chapter} chunk ${chunkIndex}`);
    throw new Error(`Too many attempts for chapter ${chapter} chunk ${chunkIndex}`);
  }

  const compiledPrompt = buildChunkedPrompt(
    chunk.paragraphs,
    chapter,
    jsonCharacters,
    previousChunkOutput,
  );
  writeBookFile(`compiled-prompt-for-chapter-${chapter}-chunk-${chunkIndex}.md`, compiledPrompt);

  const llmProviders = [callGeminiWrapper, callGeminiVertexWrapper, callGrok, callGpt5];

  try {
    checkAborted(signal, `chapter ${chapter} chunk ${chunkIndex} before provider call`);
    const selectedProvider = llmProviders[attempt % llmProviders.length];
    logger.info(
      `Using provider for chapter ${chapter} chunk ${chunkIndex}: ${selectedProvider.name}`,
    );

    const originalChunkXml = buildChunkXml(chunk.paragraphs);
    writeBookFile(
      `original-paragraphs-for-chapter-${chapter}-chunk-${chunkIndex}.xml`,
      originalChunkXml,
    );
    const geminiReminder = `\n This is your ${attempt + 1}th attempt. That means you failed previous one. Make sure to output valid html.`;

    const response = (await selectedProvider(
      `${attempt === 1 || attempt === 2 ? geminiReminder : ""} ${compiledPrompt}`,
      undefined,
      1,
    )) as string;
    logger.info(`Response for chapter ${chapter} chunk ${chunkIndex}:`, response.slice(0, 50));

    const clearedResponse = response.replace(/```xml\n/, "").replace(/\n```$/, "");
    writeBookFile(
      `rewritten-paragraphs-for-chapter-${chapter}-chunk-${chunkIndex}-${selectedProvider.name}.raw.xml`,
      clearedResponse,
    );

    let restored = clearedResponse;
    try {
      restored = restoreOriginalTextInHtml(originalChunkXml, clearedResponse);
    } catch (e) {
      logger.error(`Error restoring original text for chapter ${chapter} chunk ${chunkIndex}`, e);
    }

    try {
      restored = restoreUnwrappedLines(originalChunkXml, restored);
    } catch (e) {
      logger.error(`Error restoring unwrapped lines for chapter ${chapter} chunk ${chunkIndex}`, e);
    }

    try {
      restored = sanitizeNestedParagraphs(restored);
    } catch (e) {
      logger.error(
        `Error sanitizing nested paragraphs for chapter ${chapter} chunk ${chunkIndex}`,
        e,
      );
    }

    if (restored && compareXmlTextContent(originalChunkXml, restored)) {
      logger.info(`✅ Chunk ${chunkIndex} validated for chapter ${chapter}`);
      writeBookFile(`${chunkFileName.replace(".xml", "")}-${selectedProvider.name}.xml`, restored);
      writeBookFile(chunkFileName, restored);
      return restored;
    } else {
      writeBookFile(
        `broken-rewritten-paragraphs-for-chapter-${chapter}-chunk-${chunkIndex}-${selectedProvider.name}.xml`,
        clearedResponse,
      );
      logger.info(`❌ Validation failed for chapter ${chapter} chunk ${chunkIndex}, retrying...`);
      return processChunk(chapter, chunkIndex, chunk, jsonCharacters, previousChunkOutput, {
        attempt: attempt + 1,
        signal,
      });
    }
  } catch (e) {
    if (isAbortError(e)) {
      throw e;
    }
    logger.error(`Error for chapter ${chapter} chunk ${chunkIndex}`, e);
    return processChunk(chapter, chunkIndex, chunk, jsonCharacters, previousChunkOutput, {
      attempt: attempt + 1,
      signal,
    });
  }
}

/**
 * Process a chapter using chunking for long chapters
 */
async function processChunkedChapter(
  chapter: number,
  charactersForChapter: { name: string; summary: string }[],
  paragraphs: Paragraph[],
  sectionAttributes?: Record<string, string>,
  signal?: AbortSignal,
): Promise<string> {
  checkAborted(signal, `chapter ${chapter} chunked processing`);
  const jsonCharacters = buildJsonCharacters(charactersForChapter);
  const chunks = chunkParagraphs(paragraphs);

  logger.info(`📦 Processing chapter ${chapter} in ${chunks.length} chunks`);

  const processedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    checkAborted(signal, `chapter ${chapter} chunk loop ${i}`);
    const chunk = chunks[i];
    const previousChunkOutput = i > 0 ? processedChunks[i - 1] : null;

    logger.info(
      `📦 Processing chapter ${chapter} chunk ${i + 1}/${chunks.length} (${chunk.tokenCount} tokens)`,
    );

    const result = await processChunk(chapter, i, chunk, jsonCharacters, previousChunkOutput, {
      signal,
    });
    processedChunks.push(result);
  }

  // Combine all chunks into final output, preserving section attributes
  const combined = combineChunks(chapter, processedChunks, sectionAttributes);
  writeBookFile(`rewritten-paragraphs-for-chapter-${chapter}.xml`, combined, FILE_TYPE.TEMPORARY);

  logger.info(`✅ Chapter ${chapter} complete (${chunks.length} chunks combined)`);
  return combined;
}

export const identifyAndRewriteParagraphs = async (
  chapter: number,
  charactersForChapter: { name: string; summary: string }[],
  attempt = 0,
  signal?: AbortSignal,
): Promise<string | undefined> => {
  checkAborted(signal, `chapter ${chapter} rewrite`);
  if (doesBookFileExist(`rewritten-paragraphs-for-chapter-${chapter}.xml`, FILE_TYPE.TEMPORARY)) {
    logger.info("✅ Already rewritten for chapter " + chapter);
    return readBookFile(`rewritten-paragraphs-for-chapter-${chapter}.xml`, FILE_TYPE.TEMPORARY);
  }

  const { paragraphs: paragraphsFromChapter, sectionAttributes } =
    getChapterParagraphsAndSectionAttributes(chapter);
  const chapterFormat = getChapterFormat(chapter);

  if (chapterFormat !== "play" && needsChunking(paragraphsFromChapter)) {
    logger.info(`📦 Chapter ${chapter} exceeds token limit, using chunked processing`);
    return processChunkedChapter(
      chapter,
      charactersForChapter,
      paragraphsFromChapter,
      sectionAttributes,
      signal,
    );
  }

  // Original single-shot processing for shorter chapters
  if (attempt > 0) {
    await abortableSleep(getRetryDelayMs(attempt), signal);
  }
  if (attempt > 4) {
    logger.error("❌ Too many attempts for chapter " + chapter);
    throw new Error("Too many attempts for chapter " + chapter);
  }
  const jsonCharacters = buildJsonCharacters(charactersForChapter);

  const paragraphsForPage = paragraphsFromChapter.map(buildParagraphXml).join("\n");

  let prompt = "";
  if (chapterFormat === "play") {
    prompt = fs.readFileSync(path.join(__dirname, "RewriteParagraphsPromptPlay.md"), "utf8");
  } else if (chapterFormat === "mixed") {
    prompt = fs.readFileSync(path.join(__dirname, "RewriteParagraphsPromptMixed.md"), "utf8");
  } else {
    prompt = fs.readFileSync(path.join(__dirname, "NewRewriteParagraphsPromptBook.md"), "utf8");
  }
  const compiledPrompt = prompt
    .replace("{{paragraphs_html}}", paragraphsForPage)
    .replace("{{characters_json}}", jsonCharacters);

  writeBookFile(`compiled-prompt-for-chapter-${chapter}-gemini2.md`, compiledPrompt);

  const llmProviders = [callGeminiWrapper, callGeminiVertexWrapper, callGrok, callGpt5];

  try {
    checkAborted(signal, `chapter ${chapter} before provider call`);
    const selectedProvider = llmProviders[attempt % llmProviders.length];
    logger.info("Using provider: " + selectedProvider.name);
    writeBookFile(`original-paragraphs-for-chapter-${chapter}.xml`, paragraphsForPage);
    const geminiReminder = `\n This is your ${attempt + 1}th attempt. That means you failed previous one. Make sure to output valid html.`;

    const response = (await selectedProvider(
      `${attempt === 1 ? geminiReminder : ""} ${compiledPrompt}`,
      undefined,
      1,
    )) as string;
    logger.info(
      "identify entities for paragraph response for chapter " + chapter,
      response.slice(0, 50),
    );
    writeBookFile(
      `identify-entities-for-paragraph-response-for-chapter-${chapter}-${selectedProvider.name}.raw.txt`,
      response,
    );
    const clearedResponse = response.replace(/```xml\n/, "").replace(/\n```$/, "");

    let restored = clearedResponse;
    try {
      restored = restoreOriginalTextInHtml(paragraphsForPage, clearedResponse);
    } catch (e) {
      logger.error("Error restoring original text for chapter " + chapter, e);
    }

    try {
      restored = restoreUnwrappedLines(paragraphsForPage, restored);
    } catch (e) {
      logger.error("Error restoring unwrapped lines for chapter " + chapter, e);
    }

    try {
      restored = sanitizeNestedParagraphs(restored);
    } catch (e) {
      logger.error("Error sanitizing nested paragraphs for chapter " + chapter, e);
    }

    if (restored && compareXmlTextContent(paragraphsForPage, restored)) {
      // Build section attributes string, including format and any preserved epub-type
      const formatAttr = chapterFormat !== "prose" ? ` data-chapter-format="${chapterFormat}"` : "";
      const extraAttrs = Object.entries(sectionAttributes)
        .filter(([key]) => key !== "data-chapter-format") // Don't duplicate format attr
        .map(([key, value]) => ` ${key}="${value.replace(/"/g, "&quot;")}"`)
        .join("");
      const finalRestored = `<section data-chapter="${chapter}"${formatAttr}${extraAttrs}>${restored}</section>`;
      logger.info("✅ No changes to paragraphs for chapter " + chapter);
      writeBookFile(
        `rewritten-paragraphs-for-chapter-${chapter}-${selectedProvider.name}.xml`,
        finalRestored,
      );
      writeBookFile(`rewritten-paragraphs-for-chapter-${chapter}.xml`, finalRestored);
    } else {
      writeBookFile(
        `broken-rewritten-paragraphs-for-chapter-${chapter}-${selectedProvider.name}.xml`,
        clearedResponse,
      );

      logger.info("❌ Changes to paragraphs for chapter " + chapter);
      return identifyAndRewriteParagraphs(chapter, charactersForChapter, attempt + 1, signal);
    }
    return response;
  } catch (e) {
    if (isAbortError(e)) {
      throw e;
    }
    logger.error("Error for chapter " + chapter, e);
    return identifyAndRewriteParagraphs(chapter, charactersForChapter, attempt + 1, signal);
  }
};

interface ChapterData {
  chapter: number;
  paragraphs: Paragraph[];
  chunks: ChapterChunk[];
  jsonCharacters: string;
  needsChunking: boolean;
  sectionAttributes: Record<string, string>;
}

async function processChunkedChapterFromPreScan(
  data: ChapterData,
  signal?: AbortSignal,
): Promise<void> {
  const { chapter, chunks, jsonCharacters, sectionAttributes } = data;
  checkAborted(signal, `process pre-scanned chunked chapter ${chapter}`);

  if (chunks.length === 0) {
    return;
  }

  logger.info(`📦 Processing chapter ${chapter} in ${chunks.length} chunks`);

  const processedChunks: string[] = [];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    checkAborted(signal, `chapter ${chapter} chunk loop ${chunkIndex}`);
    const chunk = chunks[chunkIndex];

    // Feed each chunk (1+) with the previous rewritten chunk output for continuity.
    const previousChunkOutput = chunkIndex > 0 ? processedChunks[chunkIndex - 1] : null;

    logger.info(
      `📦 Processing chapter ${chapter} chunk ${chunkIndex + 1}/${chunks.length} (${chunk.tokenCount} tokens)`,
    );

    const rewrittenChunk = await processChunk(
      chapter,
      chunkIndex,
      chunk,
      jsonCharacters,
      previousChunkOutput,
      { signal },
    );
    processedChunks.push(rewrittenChunk);
  }

  if (doesBookFileExist(`rewritten-paragraphs-for-chapter-${chapter}.xml`, FILE_TYPE.TEMPORARY)) {
    return;
  }

  const combined = combineChunks(chapter, processedChunks, sectionAttributes);
  writeBookFile(`rewritten-paragraphs-for-chapter-${chapter}.xml`, combined, FILE_TYPE.TEMPORARY);
  logger.info(`✅ Chapter ${chapter} complete (${chunks.length} chunks combined)`);
}

export const identifyCharactersAndRewriteParagraphs = async (
  referenceCards: NewReferenceCardsResponse,
  signal?: AbortSignal,
) => {
  checkAborted(signal, "identifyCharactersAndRewriteParagraphs start");
  const bookSettings = getBookSettings();

  const charactersForChapter = referenceCards.characters
    .filter((c) => c.name !== "generic-avatar") // Exclude synthetic generic-avatar from LLM prompts
    .map((c) => ({ name: c.name, summary: c.referenceCard }));
  const jsonCharacters = buildJsonCharacters(charactersForChapter);

  // Prepare all chapter data
  const chapters = Array.from(
    { length: bookSettings.numberOfChaptersToProcess },
    (_, i) => bookSettings.startFromChapter + i,
  );

  const scanStart = Date.now();
  logger.info(
    `🔎 Pre-scan start for ${chapters.length} chapters (logEvery=${CHAPTER_SCAN_LOG_EVERY}, slow>${CHAPTER_SCAN_SLOW_MS}ms)`,
  );

  const chapterDataList: ChapterData[] = [];
  let alreadyCompleteCount = 0;
  let chunkedCount = 0;

  for (let index = 0; index < chapters.length; index++) {
    checkAborted(signal, `pre-scan chapter index ${index}`);
    const chapter = chapters[index];
    const chapterScanStart = Date.now();

    // Check if already complete
    if (doesBookFileExist(`rewritten-paragraphs-for-chapter-${chapter}.xml`, FILE_TYPE.TEMPORARY)) {
      alreadyCompleteCount += 1;
      const chapterData: ChapterData = {
        chapter,
        paragraphs: [],
        chunks: [],
        jsonCharacters,
        needsChunking: false,
        sectionAttributes: {},
      };
      chapterDataList.push(chapterData);

      const elapsedMs = Date.now() - chapterScanStart;
      const processed = index + 1;
      if (
        elapsedMs >= CHAPTER_SCAN_SLOW_MS ||
        processed === 1 ||
        processed === chapters.length ||
        processed % CHAPTER_SCAN_LOG_EVERY === 0
      ) {
        logger.info(
          `🔎 Pre-scan ${processed}/${chapters.length}: chapter ${chapter} already complete (${elapsedMs}ms)`,
        );
      }
      continue;
    }

    const { paragraphs, sectionAttributes } = getChapterParagraphsAndSectionAttributes(chapter);
    const chapterFormat = getChapterFormat(chapter);
    const shouldChunk = chapterFormat !== "play" && needsChunking(paragraphs);
    const chunks = shouldChunk ? chunkParagraphs(paragraphs) : [];
    if (shouldChunk) {
      chunkedCount += 1;
    }

    const chapterData: ChapterData = {
      chapter,
      paragraphs,
      chunks,
      jsonCharacters,
      needsChunking: shouldChunk,
      sectionAttributes,
    };
    chapterDataList.push(chapterData);

    const elapsedMs = Date.now() - chapterScanStart;
    const processed = index + 1;
    if (
      elapsedMs >= CHAPTER_SCAN_SLOW_MS ||
      processed === 1 ||
      processed === chapters.length ||
      processed % CHAPTER_SCAN_LOG_EVERY === 0
    ) {
      logger.info(
        `🔎 Pre-scan ${processed}/${chapters.length}: chapter ${chapter}, paragraphs=${paragraphs.length}, format=${chapterFormat}, chunked=${shouldChunk} (${elapsedMs}ms)`,
      );
    }
  }

  const scanElapsedMs = Date.now() - scanStart;
  logger.info(
    `🔎 Pre-scan complete in ${scanElapsedMs}ms: total=${chapters.length}, alreadyComplete=${alreadyCompleteCount}, chunked=${chunkedCount}, simple=${chapters.length - alreadyCompleteCount - chunkedCount}`,
  );

  // Separate chapters that need chunking from those that don't
  const chunkedChapters = chapterDataList.filter((c) => c.needsChunking && c.chunks.length > 0);
  const simpleChapters = chapterDataList.filter((c) => !c.needsChunking && c.paragraphs.length > 0);

  logger.info(
    `📦 Processing ${chunkedChapters.length} chunked chapters and ${simpleChapters.length} simple chapters`,
  );

  // Process simple chapters in parallel (no chunking needed)
  const simplePromises = simpleChapters.map((data) =>
    identifyAndRewriteParagraphs(data.chapter, charactersForChapter, 0, signal),
  );

  const chunkedPromises = chunkedChapters.map((data) =>
    processChunkedChapterFromPreScan(data, signal),
  );

  logger.info(
    `🚀 Running ${chunkedPromises.length} chunked chapter tasks + ${simplePromises.length} simple tasks in parallel`,
  );
  checkAborted(signal, "before chapter-level Promise.all");
  await Promise.all([...simplePromises, ...chunkedPromises]);

  logger.info(`✅ All chapters processed`);
};

if (require.main === module) {
  const referenceCards = JSON.parse(
    readBookFile("single-summary-per-person.json", FILE_TYPE.PERMANENT),
  ) as NewReferenceCardsResponse;

  identifyCharactersAndRewriteParagraphs(referenceCards).then(() => {
    console.log("Done");
    process.exit(0);
  });
}
