import { callClaude, callGeminiWrapper } from "../callClaude";
import {
  getParagraphsFromChapter,
  getSectionAttributesFromChapter,
} from "./createParagraphsWithPageNumbers";
import { logger } from "../logger";
import fs from "fs";
import { compareXmlTextContent } from "./new-tooling/compare-chapters-xml";
import { restoreOriginalTextInHtml } from "./new-tooling/restore-text-in-html";
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
import { sleep } from "./sleep";
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
async function processChunk(
  chapter: number,
  chunkIndex: number,
  chunk: ChapterChunk,
  jsonCharacters: string,
  previousChunkOutput: string | null,
  attempt: number = 0,
): Promise<string> {
  const chunkFileName = `rewritten-paragraphs-for-chapter-${chapter}-chunk-${chunkIndex}.xml`;

  // Check if chunk already processed
  if (doesBookFileExist(chunkFileName, FILE_TYPE.TEMPORARY)) {
    logger.info(`✅ Chunk ${chunkIndex} already rewritten for chapter ${chapter}`);
    return readBookFile(chunkFileName, FILE_TYPE.TEMPORARY);
  }

  if (attempt > 0) {
    await sleep(10000 * attempt * attempt);
  }
  if (attempt > 4) {
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

  const llmProviders = [callGeminiWrapper, callClaude, callGpt5, callGrok];

  try {
    const selectedProvider = llmProviders[attempt % llmProviders.length];
    logger.info(
      `Using provider for chapter ${chapter} chunk ${chunkIndex}: ${selectedProvider.name}`,
    );

    const originalChunkXml = buildChunkXml(chapter, chunk.paragraphs);
    writeBookFile(
      `original-paragraphs-for-chapter-${chapter}-chunk-${chunkIndex}.xml`,
      originalChunkXml,
    );

    const response = (await selectedProvider(compiledPrompt, undefined, 1)) as string;
    logger.info(`Response for chapter ${chapter} chunk ${chunkIndex}:`, response.slice(0, 50));

    const clearedResponse = response.replace(/```xml\n/, "").replace(/\n```$/, "");

    let restored = clearedResponse;
    try {
      restored = restoreOriginalTextInHtml(originalChunkXml, clearedResponse);
    } catch (e) {
      logger.error(`Error restoring original text for chapter ${chapter} chunk ${chunkIndex}`, e);
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
      return processChunk(
        chapter,
        chunkIndex,
        chunk,
        jsonCharacters,
        previousChunkOutput,
        attempt + 1,
      );
    }
  } catch (e) {
    logger.error(`Error for chapter ${chapter} chunk ${chunkIndex}`, e);
    return processChunk(
      chapter,
      chunkIndex,
      chunk,
      jsonCharacters,
      previousChunkOutput,
      attempt + 1,
    );
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
): Promise<string> {
  const jsonCharacters = buildJsonCharacters(charactersForChapter);
  const chunks = chunkParagraphs(paragraphs);

  logger.info(`📦 Processing chapter ${chapter} in ${chunks.length} chunks`);

  const processedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const previousChunkOutput = i > 0 ? processedChunks[i - 1] : null;

    logger.info(
      `📦 Processing chapter ${chapter} chunk ${i + 1}/${chunks.length} (${chunk.tokenCount} tokens)`,
    );

    const result = await processChunk(chapter, i, chunk, jsonCharacters, previousChunkOutput);
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
): Promise<string | undefined> => {
  if (doesBookFileExist(`rewritten-paragraphs-for-chapter-${chapter}.xml`, FILE_TYPE.TEMPORARY)) {
    logger.info("✅ Already rewritten for chapter " + chapter);
    return readBookFile(`rewritten-paragraphs-for-chapter-${chapter}.xml`, FILE_TYPE.TEMPORARY);
  }

  const paragraphsFromChapter: { text: string; dataIndex: number; elementType: string }[] =
    getParagraphsFromChapter(chapter);

  const chapterFormat = getChapterFormat(chapter);

  // Get section-level attributes to preserve (e.g., data-epub-type for semantic styling)
  const sectionAttributes = getSectionAttributesFromChapter(chapter);

  if (chapterFormat !== "play" && needsChunking(paragraphsFromChapter)) {
    logger.info(`📦 Chapter ${chapter} exceeds token limit, using chunked processing`);
    return processChunkedChapter(
      chapter,
      charactersForChapter,
      paragraphsFromChapter,
      sectionAttributes,
    );
  }

  // Original single-shot processing for shorter chapters
  if (attempt > 0) {
    await sleep(10000 * attempt * attempt);
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

  // const llmProviders = [callGeminiWrapper, callClaude];

  const llmProviders = [callGeminiWrapper, callClaude, callGpt5];
  // const llmProviders = [callGeminiWrapper];
  try {
    const selectedProvider = llmProviders[attempt % llmProviders.length];
    logger.info("Using provider: " + selectedProvider.name);
    writeBookFile(`original-paragraphs-for-chapter-${chapter}.xml`, paragraphsForPage);
    const response = (await selectedProvider(compiledPrompt, undefined, 1)) as string;
    logger.info(
      "identify entities for paragraph response for chapter " + chapter,
      response.slice(0, 50),
    );
    const clearedResponse = response.replace(/```xml\n/, "").replace(/\n```$/, "");

    let restored = clearedResponse;
    try {
      restored = restoreOriginalTextInHtml(paragraphsForPage, clearedResponse);
    } catch (e) {
      logger.error("Error restoring original text for chapter " + chapter, e);
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
      return identifyAndRewriteParagraphs(chapter, charactersForChapter, attempt + 1);
    }
    return response;
  } catch (e) {
    logger.error("Error for chapter " + chapter, e);
    return identifyAndRewriteParagraphs(chapter, charactersForChapter, attempt + 1);
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

export const identifyCharactersAndRewriteParagraphs = async (
  referenceCards: NewReferenceCardsResponse,
) => {
  const bookSettings = getBookSettings();

  const charactersForChapter = referenceCards.characters.map((c) => ({
    name: c.name,
    summary: c.referenceCard,
  }));
  const jsonCharacters = buildJsonCharacters(charactersForChapter);

  // Prepare all chapter data
  const chapters = Array.from(
    { length: bookSettings.numberOfChaptersToProcess },
    (_, i) => bookSettings.startFromChapter + i,
  );

  const chapterDataList: ChapterData[] = chapters.map((chapter) => {
    // Check if already complete
    if (doesBookFileExist(`rewritten-paragraphs-for-chapter-${chapter}.xml`, FILE_TYPE.TEMPORARY)) {
      logger.info(`✅ Chapter ${chapter} already complete`);
      return {
        chapter,
        paragraphs: [],
        chunks: [],
        jsonCharacters,
        needsChunking: false,
        sectionAttributes: {},
      };
    }

    const paragraphs = getParagraphsFromChapter(chapter);
    const chapterFormat = getChapterFormat(chapter);
    const shouldChunk = chapterFormat !== "play" && needsChunking(paragraphs);
    const chunks = shouldChunk ? chunkParagraphs(paragraphs) : [];
    const sectionAttributes = getSectionAttributesFromChapter(chapter);

    return {
      chapter,
      paragraphs,
      chunks,
      jsonCharacters,
      needsChunking: shouldChunk,
      sectionAttributes,
    };
  });

  // Separate chapters that need chunking from those that don't
  const chunkedChapters = chapterDataList.filter((c) => c.needsChunking && c.chunks.length > 0);
  const simpleChapters = chapterDataList.filter((c) => !c.needsChunking && c.paragraphs.length > 0);

  logger.info(
    `📦 Processing ${chunkedChapters.length} chunked chapters and ${simpleChapters.length} simple chapters`,
  );

  // Process simple chapters in parallel (no chunking needed)
  const simplePromises = simpleChapters.map((data) =>
    identifyAndRewriteParagraphs(data.chapter, charactersForChapter),
  );

  // PHASE 1: Process all chunk 0s AND chunk 1s in parallel
  // Chunk 1 gets RAW chunk 0 text as context (not tagged output)
  const phase1Promises: Promise<string>[] = [];
  for (const data of chunkedChapters) {
    const { chapter, chunks } = data;

    // Chunk 0 (no context)
    logger.info(`📦 Queueing chapter ${chapter} chunk 0/${chunks.length}`);
    phase1Promises.push(processChunk(chapter, 0, chunks[0], jsonCharacters, null));

    // Chunk 1 (RAW chunk 0 text as context) - if exists
    if (chunks.length > 1) {
      const rawChunk0Context = buildChunkXml(chapter, chunks[0].paragraphs);
      logger.info(`📦 Queueing chapter ${chapter} chunk 1/${chunks.length} (with RAW context)`);
      phase1Promises.push(processChunk(chapter, 1, chunks[1], jsonCharacters, rawChunk0Context));
    }
  }

  // Run phase 1 + simple chapters in parallel
  logger.info(
    `🚀 Phase 1: Running ${phase1Promises.length} chunk tasks + ${simplePromises.length} simple tasks in parallel`,
  );
  await Promise.all([...phase1Promises, ...simplePromises]);

  // PHASE 2+: Process remaining chunks (chunk 2, 3, etc.) using TAGGED previous chunk output
  let currentChunkIndex = 2;
  let hasMoreChunks = true;

  while (hasMoreChunks) {
    const phasePromises: Promise<string>[] = [];
    hasMoreChunks = false;

    for (const data of chunkedChapters) {
      const { chapter, chunks } = data;

      if (chunks.length > currentChunkIndex) {
        hasMoreChunks = true;
        // Get TAGGED output from previous chunk
        const taggedPreviousChunk = readBookFile(
          `rewritten-paragraphs-for-chapter-${chapter}-chunk-${currentChunkIndex - 1}.xml`,
          FILE_TYPE.TEMPORARY,
        );
        logger.info(
          `📦 Queueing chapter ${chapter} chunk ${currentChunkIndex}/${chunks.length} (with TAGGED context)`,
        );
        phasePromises.push(
          processChunk(
            chapter,
            currentChunkIndex,
            chunks[currentChunkIndex],
            jsonCharacters,
            taggedPreviousChunk,
          ),
        );
      }
    }

    if (phasePromises.length > 0) {
      logger.info(
        `🚀 Phase ${currentChunkIndex}: Running ${phasePromises.length} chunk tasks in parallel`,
      );
      await Promise.all(phasePromises);
    }

    currentChunkIndex++;
  }

  // Combine all chunks for each chunked chapter
  for (const data of chunkedChapters) {
    const { chapter, chunks, sectionAttributes } = data;

    // Check if already combined
    if (doesBookFileExist(`rewritten-paragraphs-for-chapter-${chapter}.xml`, FILE_TYPE.TEMPORARY)) {
      continue;
    }

    const processedChunks = chunks.map((_, i) =>
      readBookFile(
        `rewritten-paragraphs-for-chapter-${chapter}-chunk-${i}.xml`,
        FILE_TYPE.TEMPORARY,
      ),
    );
    const combined = combineChunks(chapter, processedChunks, sectionAttributes);
    writeBookFile(`rewritten-paragraphs-for-chapter-${chapter}.xml`, combined, FILE_TYPE.TEMPORARY);
    logger.info(`✅ Chapter ${chapter} complete (${chunks.length} chunks combined)`);
  }

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
