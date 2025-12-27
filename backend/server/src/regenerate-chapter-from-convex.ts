import fs from "fs";
import path from "path";
import { callClaude, callGeminiWrapper } from "../../src/callClaude";
import { callGpt5 } from "../../src/callO3";
import { callGrok } from "../../src/callGrok";
import { compareXmlTextContent, restoreOriginalText } from "../../src/tools/new-tooling/compare-chapters-xml";
import { generateTagName } from "../../src/helpers/generateTagName";
import { needsChunking, chunkParagraphs, combineChunks, type Paragraph, type ChapterChunk } from "../../src/tools/chapterChunker";
import { convex, getChapterXml, getCharacterReferenceCards } from "./convex-client";
import { stripCharacterTags, parseXmlToParagraphs } from "./chapter-xml-helpers";

interface Character {
  name: string;
  summary: string;
}

const PROMPTS_DIR = path.resolve(__dirname, "../../src/tools");

function loadPromptTemplate(type: "book" | "play" | "chunked"): string {
  const filename = type === "play" ? "RewriteParagraphsPromptPlay.md" : type === "chunked" ? "RewriteParagraphsPromptBookChunked.md" : "RewriteParagraphsPromptBook.md";
  return fs.readFileSync(path.join(PROMPTS_DIR, filename), "utf8");
}

function buildXmlCharacters(characters: Character[]): string {
  return characters
    .map((entity) => {
      const tagName = generateTagName(entity.name.trim(), true);
      const displayName = entity.name.trim().replace(/"/g, "&quot;");
      const summaryText = entity.summary.trim().replace(/"/g, "&quot;");
      return `<${tagName} display="${displayName}" summary="${summaryText}" />`;
    })
    .join("\n");
}

function buildChunkXml(chapterId: number, paragraphs: Paragraph[]): string {
  const paragraphsXml = paragraphs.map((p) => `<${p.elementType}>${p.text.trim().replace(/"/g, "'")}</${p.elementType}>`).join("\n");
  return `<Chapter id="${chapterId}">${paragraphsXml}</Chapter>`;
}

function buildChunkedPrompt(paragraphs: Paragraph[], chapterId: number, xmlCharacters: string, previousChunkOutput: string | null): string {
  const prompt = loadPromptTemplate("chunked");
  const paragraphsXml = `<Chapter id="${chapterId}">${paragraphs.map((p) => `<${p.elementType}>${p.text.trim().replace(/"/g, "'")}</${p.elementType}>`).join("\n")}</Chapter>`;

  let previousContextSection = "";
  let outputOnlyInstruction = "";

  if (previousChunkOutput) {
    previousContextSection = `
## CONTEXT FROM PREVIOUS SECTION

The following is the PREVIOUS section of this chapter. Use it ONLY as context to understand who is speaking and character references. DO NOT include this section in your output.

<PreviousContext>
${previousChunkOutput}
</PreviousContext>

**IMPORTANT:** Your output should ONLY contain the paragraphs from the "Paragraphs to Process" section below. Do NOT include any paragraphs from the PreviousContext section.
`;
    outputOnlyInstruction = `
**OUTPUT ONLY THE "Paragraphs to Process" SECTION. Do NOT include the PreviousContext in your output.**
`;
  }

  return prompt
    .replace("{{paragraphs}}", paragraphsXml)
    .replace("{{characters}}", xmlCharacters)
    .replace("{{previousContextSection}}", previousContextSection)
    .replace("{{outputOnlyInstruction}}", outputOnlyInstruction);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const llmProviders = [callGeminiWrapper, callGrok, callClaude, callGpt5];

async function processChunk(
  chapterId: number,
  chunkIndex: number,
  chunk: ChapterChunk,
  xmlCharacters: string,
  previousChunkOutput: string | null,
  allCharacterTagNames: string[],
  attempt: number = 0,
): Promise<string> {
  if (attempt > 0) {
    await sleep(10000 * attempt * attempt);
  }
  if (attempt > 4) {
    throw new Error(`Too many attempts for chapter ${chapterId} chunk ${chunkIndex}`);
  }

  const compiledPrompt = buildChunkedPrompt(chunk.paragraphs, chapterId, xmlCharacters, previousChunkOutput);
  const originalChunkXml = buildChunkXml(chapterId, chunk.paragraphs);

  const selectedProvider = llmProviders[attempt % llmProviders.length];
  console.log(`[chunk ${chunkIndex}] Using provider: ${selectedProvider.name}`);

  try {
    const response = (await selectedProvider(compiledPrompt, undefined, 1)) as string;
    const clearedResponse = response.replace(/```xml\n/, "").replace(/\n```$/, "");

    let restored: string | undefined;
    try {
      restored = restoreOriginalText(originalChunkXml, clearedResponse, allCharacterTagNames);
    } catch (e) {
      console.error(`[chunk ${chunkIndex}] Error restoring original text:`, e);
    }

    if (restored && compareXmlTextContent(originalChunkXml, restored)) {
      console.log(`✅ Chunk ${chunkIndex} validated for chapter ${chapterId}`);
      return restored;
    } else {
      console.log(`❌ Validation failed for chapter ${chapterId} chunk ${chunkIndex}, retrying...`);
      return processChunk(chapterId, chunkIndex, chunk, xmlCharacters, previousChunkOutput, allCharacterTagNames, attempt + 1);
    }
  } catch (e) {
    console.error(`[chunk ${chunkIndex}] Error:`, e);
    return processChunk(chapterId, chunkIndex, chunk, xmlCharacters, previousChunkOutput, allCharacterTagNames, attempt + 1);
  }
}

async function processChunkedChapter(chapterId: number, paragraphs: Paragraph[], characters: Character[], allCharacterTagNames: string[]): Promise<string> {
  const xmlCharacters = buildXmlCharacters(characters);
  const chunks = chunkParagraphs(paragraphs);

  console.log(`📦 Processing chapter ${chapterId} in ${chunks.length} chunks`);

  const processedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const previousChunkOutput = i > 0 ? processedChunks[i - 1] : null;

    console.log(`📦 Processing chapter ${chapterId} chunk ${i + 1}/${chunks.length} (${chunk.tokenCount} tokens)`);

    const result = await processChunk(chapterId, i, chunk, xmlCharacters, previousChunkOutput, allCharacterTagNames);
    processedChunks.push(result);
  }

  const combined = combineChunks(chapterId, processedChunks);
  console.log(`✅ Chapter ${chapterId} complete (${chunks.length} chunks combined)`);
  return combined;
}

async function processSingleChapter(chapterId: number, paragraphs: Paragraph[], characters: Character[], allCharacterTagNames: string[], attempt: number = 0): Promise<string> {
  if (attempt > 0) {
    await sleep(10000 * attempt * attempt);
  }
  if (attempt > 4) {
    throw new Error(`Too many attempts for chapter ${chapterId}`);
  }

  const xmlCharacters = buildXmlCharacters(characters);
  const paragraphsForPage = `<Chapter id="${chapterId}">${paragraphs.map((p) => `<${p.elementType}>${p.text.trim().replace(/"/g, "'")}</${p.elementType}>`).join("\n")}</Chapter>`;

  const prompt = loadPromptTemplate("book");
  const compiledPrompt = prompt.replace("{{paragraphs}}", paragraphsForPage).replace("{{characters}}", xmlCharacters);

  const selectedProvider = llmProviders[attempt % llmProviders.length];
  console.log(`Using provider: ${selectedProvider.name}`);

  try {
    const response = (await selectedProvider(compiledPrompt, undefined, 1)) as string;
    const clearedResponse = response.replace(/```xml\n/, "").replace(/\n```$/, "");

    let restored: string | undefined;
    try {
      restored = restoreOriginalText(paragraphsForPage, clearedResponse, allCharacterTagNames);
    } catch (e) {
      console.error(`Error restoring original text for chapter ${chapterId}:`, e);
    }

    if (restored && compareXmlTextContent(paragraphsForPage, restored)) {
      console.log(`✅ Chapter ${chapterId} validated`);
      return restored;
    } else {
      console.log(`❌ Validation failed for chapter ${chapterId}, retrying...`);
      return processSingleChapter(chapterId, paragraphs, characters, allCharacterTagNames, attempt + 1);
    }
  } catch (e) {
    console.error(`Error for chapter ${chapterId}:`, e);
    return processSingleChapter(chapterId, paragraphs, characters, allCharacterTagNames, attempt + 1);
  }
}

export async function rewriteParagraphsWithCharacterTags(chapterId: number, paragraphs: Paragraph[], characters: Character[]): Promise<string> {
  const allCharacterTagNames = characters.map((c) => generateTagName(c.name, true)) as string[];

  if (needsChunking(paragraphs)) {
    console.log(`📦 Chapter ${chapterId} exceeds token limit, using chunked processing`);
    return processChunkedChapter(chapterId, paragraphs, characters, allCharacterTagNames);
  }

  return processSingleChapter(chapterId, paragraphs, characters, allCharacterTagNames);
}

export async function regenerateChapterFromConvex(bookPath: string, chapterNumber: number): Promise<{ success: boolean; error?: string; newXml?: string }> {
  console.log(`[regenerateChapterFromConvex] Starting for ${bookPath} chapter ${chapterNumber}`);

  const chapterXml = await getChapterXml(bookPath, chapterNumber);
  if (!chapterXml) {
    return { success: false, error: `Chapter ${chapterNumber} not found in Convex` };
  }
  console.log(`[regenerateChapterFromConvex] Fetched chapter XML (${chapterXml.length} chars)`);

  const strippedXml = stripCharacterTags(chapterXml);
  const { paragraphs, chapterId } = parseXmlToParagraphs(strippedXml);
  console.log(`[regenerateChapterFromConvex] Parsed ${paragraphs.length} paragraphs from chapter ${chapterId}`);

  if (paragraphs.length === 0) {
    return { success: false, error: "No paragraphs found in chapter XML" };
  }

  const characterCards = await getCharacterReferenceCards(bookPath);
  if (characterCards.length === 0) {
    return { success: false, error: "No character reference cards found in Convex" };
  }
  console.log(`[regenerateChapterFromConvex] Found ${characterCards.length} character reference cards`);

  const characters: Character[] = characterCards.map((c) => ({ name: c.name, summary: c.summary }));

  let newXml: string;
  try {
    newXml = await rewriteParagraphsWithCharacterTags(chapterId, paragraphs, characters);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `LLM processing failed: ${msg}` };
  }

  console.log(`[regenerateChapterFromConvex] Uploading new XML to Convex...`);
  try {
    await convex.uploadFile({
      folderPath: `${bookPath}/chapters`,
      basename: `chapter-${chapterNumber}.xml`,
      content: Buffer.from(newXml),
      contentType: "application/xml",
      publish: true,
      extra: { type: "chapter", chapterNumber, title: `Chapter ${chapterNumber}`, regeneratedAt: new Date().toISOString() },
    });
    console.log(`[regenerateChapterFromConvex] ✅ Upload complete`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Upload failed: ${msg}`, newXml };
  }

  return { success: true, newXml };
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: tsx regenerate-chapter-from-convex.ts <book-path> <chapter-number>");
    console.log("Example: tsx regenerate-chapter-from-convex.ts books/1766836328269-the-king-in-yellow 3");
    process.exit(1);
  }

  const bookPath = args[0];
  const chapterNumber = parseInt(args[1], 10);

  if (isNaN(chapterNumber)) {
    console.error("Chapter number must be a valid integer");
    process.exit(1);
  }

  regenerateChapterFromConvex(bookPath, chapterNumber).then((result) => {
    if (result.success) {
      console.log("✅ Chapter regeneration complete");
    } else {
      console.error(`❌ Failed: ${result.error}`);
    }
    process.exit(result.success ? 0 : 1);
  });
}
