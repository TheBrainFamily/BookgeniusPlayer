import { encode } from "gpt-tokenizer";

export interface Paragraph {
  text: string;
  dataIndex: number;
  elementType: string;
  attributes?: Record<string, string>;
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
export function needsChunking(
  paragraphs: Paragraph[],
  maxTokens: number = MAX_TOKENS_PER_CHUNK,
): boolean {
  const totalTokens = countParagraphsTokens(paragraphs);
  return totalTokens > maxTokens;
}

/**
 * Split paragraphs into chunks of approximately maxTokens each.
 * Respects paragraph boundaries - never splits mid-paragraph.
 */
export function chunkParagraphs(
  paragraphs: Paragraph[],
  maxTokens: number = MAX_TOKENS_PER_CHUNK,
): ChapterChunk[] {
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
    chunks.push({
      chunkIndex: chunks.length,
      totalChunks: 0,
      paragraphs: currentChunk,
      tokenCount: currentTokenCount,
    });
  }

  // Update totalChunks for all chunks
  for (const chunk of chunks) {
    chunk.totalChunks = chunks.length;
  }

  return chunks;
}

function buildAttributeString(attributes?: Record<string, string>): string {
  if (!attributes || Object.keys(attributes).length === 0) return "";
  return (
    " " +
    Object.entries(attributes)
      .map(([key, value]) => `${key}="${value.replace(/"/g, "&quot;")}"`)
      .join(" ")
  );
}

export function buildParagraphXml(p: Paragraph): string {
  const attrs = buildAttributeString(p.attributes);
  return `<${p.elementType}${attrs}>${p.text.trim().replace(/"/g, "'")}</${p.elementType}>`;
}

export function buildChunkXml(chapterId: number, paragraphs: Paragraph[]): string {
  return paragraphs.map(buildParagraphXml).join("\n");
}

/**
 * Build attribute string from a Record of attributes
 */
function buildSectionAttributeString(attributes?: Record<string, string>): string {
  if (!attributes || Object.keys(attributes).length === 0) return "";
  return (
    " " +
    Object.entries(attributes)
      .map(([key, value]) => `${key}="${value.replace(/"/g, "&quot;")}"`)
      .join(" ")
  );
}

/**
 * Combine multiple chunk XML outputs into a single chapter XML
 * @param chapterId - The chapter number
 * @param chunkOutputs - Array of chunk XML strings
 * @param sectionAttributes - Optional section-level attributes to preserve (e.g., data-epub-type)
 */
export function combineChunks(
  chapterId: number,
  chunkOutputs: string[],
  sectionAttributes?: Record<string, string>,
): string {
  const extraAttrs = buildSectionAttributeString(sectionAttributes);
  return `<section data-chapter="${chapterId}"${extraAttrs}>\n${chunkOutputs.join("\n")}\n</section>`;
}
