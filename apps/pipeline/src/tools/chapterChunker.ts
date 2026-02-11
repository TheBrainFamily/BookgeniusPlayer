import { encode } from "gpt-tokenizer";

export interface ContainerInfo {
  /** Unique per container DOM instance (e.g. "c0", "c1") — stable across leaves sharing the same parent */
  id: string;
  tagName: string;
  attributes: Record<string, string>;
}

export interface Paragraph {
  text: string;
  dataIndex: number;
  elementType: string;
  attributes?: Record<string, string>;
  /** Outermost-first ancestry chain of container elements (blockquote, header, footer, etc.) */
  containers?: ContainerInfo[];
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
 * Group paragraphs into "top-level groups" for chunking.
 * Paragraphs sharing the same root container (containers[0].id) form one group and must stay together.
 * Top-level paragraphs (no containers) are each their own group.
 */
function groupByTopLevelContainer(paragraphs: Paragraph[]): Paragraph[][] {
  const groups: Paragraph[][] = [];
  let currentGroup: Paragraph[] = [];
  let currentRootId: string | null = null;

  for (const p of paragraphs) {
    const rootId = p.containers && p.containers.length > 0 ? p.containers[0].id : null;

    if (rootId === null) {
      // Top-level paragraph — flush any current group, then add as its own group
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
        currentRootId = null;
      }
      groups.push([p]);
    } else if (rootId === currentRootId) {
      // Same root container — add to current group
      currentGroup.push(p);
    } else {
      // New root container — flush previous group and start new one
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [p];
      currentRootId = rootId;
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Split paragraphs into chunks of approximately maxTokens each.
 * Respects paragraph boundaries — never splits mid-paragraph.
 * Respects container boundaries — paragraphs sharing a root container stay in the same chunk.
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

  const groups = groupByTopLevelContainer(paragraphs);
  const chunks: ChapterChunk[] = [];
  let currentChunk: Paragraph[] = [];
  let currentTokenCount = 0;

  for (const group of groups) {
    const groupTokens = countParagraphsTokens(group);

    // If adding this group would exceed the limit and we have content,
    // finish the current chunk and start a new one
    if (currentTokenCount + groupTokens > maxTokens && currentChunk.length > 0) {
      chunks.push({
        chunkIndex: chunks.length,
        totalChunks: 0, // Will be updated after all chunks are created
        paragraphs: currentChunk,
        tokenCount: currentTokenCount,
      });
      currentChunk = [];
      currentTokenCount = 0;
    }

    // Add entire group to current chunk (keeps container intact)
    currentChunk.push(...group);
    currentTokenCount += groupTokens;
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

const HTML_VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export function buildParagraphXml(p: Paragraph): string {
  const attrs = buildAttributeString(p.attributes);
  if (HTML_VOID_ELEMENTS.has(p.elementType)) {
    if (p.text.trim().startsWith(`<${p.elementType}`)) {
      throw new Error(
        `Void element <${p.elementType}> at data-index ${p.dataIndex} has its own markup as text (cheerio serialization bug): "${p.text}"`,
      );
    }
    return `<${p.elementType}${attrs}/>`;
  }
  return `<${p.elementType}${attrs}>${p.text.trim()}</${p.elementType}>`;
}

export function buildChunkXml(paragraphs: Paragraph[]): string {
  // Fast path: if no paragraph has containers, return flat output (unchanged behavior)
  const hasContainers = paragraphs.some((p) => p.containers && p.containers.length > 0);
  if (!hasContainers) {
    return paragraphs.map(buildParagraphXml).join("\n");
  }

  const lines: string[] = [];
  let openContainers: ContainerInfo[] = [];

  for (const p of paragraphs) {
    const current = p.containers ?? [];

    // Find common prefix length between open containers and current containers
    let commonLen = 0;
    while (
      commonLen < openContainers.length &&
      commonLen < current.length &&
      openContainers[commonLen].id === current[commonLen].id
    ) {
      commonLen++;
    }

    // Close containers that ended (innermost first)
    for (let i = openContainers.length - 1; i >= commonLen; i--) {
      lines.push(`</${openContainers[i].tagName}>`);
    }

    // Open new containers (outermost first)
    for (let i = commonLen; i < current.length; i++) {
      const c = current[i];
      lines.push(`<${c.tagName}${buildAttributeString(c.attributes)}>`);
    }

    lines.push(buildParagraphXml(p));
    openContainers = current;
  }

  // Close all remaining open containers
  for (let i = openContainers.length - 1; i >= 0; i--) {
    lines.push(`</${openContainers[i].tagName}>`);
  }

  return lines.join("\n");
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
