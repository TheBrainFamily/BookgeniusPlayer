import { encode } from "gpt-tokenizer";

export interface Paragraph {
  text: string;
  dataIndex: number;
  elementType: string;
}

export interface ChapterChunk {
  chunkIndex: number;
  totalChunks: number;
  paragraphs: Paragraph[];
  tokenCount: number;
}

const MAX_TOKENS_PER_CHUNK = 8000;

/**
 * Count tokens in a string using gpt-tokenizer
 */
export function countTokens(text: string): number {
  return encode(text).length;
}

/**
 * Count total tokens for an array of paragraphs
 */
export function countParagraphsTokens(paragraphs: Paragraph[]): number {
  return paragraphs.reduce((total, p) => total + countTokens(p.text), 0);
}

/**
 * Check if a chapter needs to be chunked based on token count
 */
export function needsChunking(paragraphs: Paragraph[], maxTokens: number = MAX_TOKENS_PER_CHUNK): boolean {
  const totalTokens = countParagraphsTokens(paragraphs);
  return totalTokens > maxTokens;
}

/**
 * Split paragraphs into chunks of approximately maxTokens each.
 * Respects paragraph boundaries - never splits mid-paragraph.
 */
export function chunkParagraphs(paragraphs: Paragraph[], maxTokens: number = MAX_TOKENS_PER_CHUNK): ChapterChunk[] {
  const totalTokens = countParagraphsTokens(paragraphs);

  // If under threshold, return single chunk
  if (totalTokens <= maxTokens) {
    return [{ chunkIndex: 0, totalChunks: 1, paragraphs, tokenCount: totalTokens }];
  }

  const chunks: ChapterChunk[] = [];
  let currentChunk: Paragraph[] = [];
  let currentTokenCount = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = countTokens(paragraph.text);

    // If adding this paragraph would exceed the limit and we have content,
    // finish the current chunk and start a new one
    if (currentTokenCount + paragraphTokens > maxTokens && currentChunk.length > 0) {
      chunks.push({
        chunkIndex: chunks.length,
        totalChunks: 0, // Will be updated after all chunks are created
        paragraphs: currentChunk,
        tokenCount: currentTokenCount,
      });
      currentChunk = [];
      currentTokenCount = 0;
    }

    // Add paragraph to current chunk
    currentChunk.push(paragraph);
    currentTokenCount += paragraphTokens;
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push({ chunkIndex: chunks.length, totalChunks: 0, paragraphs: currentChunk, tokenCount: currentTokenCount });
  }

  // Update totalChunks for all chunks
  for (const chunk of chunks) {
    chunk.totalChunks = chunks.length;
  }

  return chunks;
}

/**
 * Build XML string for a chunk's paragraphs (for validation)
 */
export function buildChunkXml(chapterId: number, paragraphs: Paragraph[]): string {
  const paragraphsXml = paragraphs
    .map((p) => `<${p.elementType}>${p.text.trim().replace(/"/g, "'")}</${p.elementType}>`)
    .join("\n");

  return `<Chapter id="${chapterId}">${paragraphsXml}</Chapter>`;
}

/**
 * Combine multiple chunk XML outputs into a single chapter XML
 */
export function combineChunks(chapterId: number, chunkOutputs: string[]): string {
  // Extract the inner content from each chunk (removing <Chapter> wrapper)
  const innerContents = chunkOutputs.map((xml) => {
    // Match content between <Chapter ...> and </Chapter>
    const match = xml.match(/<Chapter[^>]*>([\s\S]*)<\/Chapter>/i);
    return match ? match[1].trim() : xml;
  });

  // Combine into single chapter
  return `<Chapter id="${chapterId}">\n${innerContents.join("\n")}\n</Chapter>`;
}
