import { S3Client } from "bun";
import { LRUCache } from "lru-cache";
import { generateChaptersXmlFromRich } from "../../tools/new-tooling/generate-chapters-xml-from-rich";

export type Document = { text: string; chapter: number; paragraphNumber: number };
export type DocumentWithEmbeddings = Document & { Embeddings: number[] };
export type BookEmbeddings = Map<number, DocumentWithEmbeddings[]>;

interface CachedBookData {
  embeddings: BookEmbeddings;
  richXml: string;
  chapters: string;
  sizeBytes: number;
  loadedAt: number;
}

const DEFAULT_RAM_BUDGET_MB = 1500;
const RAM_BUDGET_MB = Number(process.env.EMBEDDING_RAM_BUDGET_MB) || DEFAULT_RAM_BUDGET_MB;
const RAM_BUDGET = RAM_BUDGET_MB * 1024 * 1024;
const PREFETCH_MODE = process.env.PREFETCH_ALL_BOOKS === "true";
const FIFTEEN_MINUTES = 1000 * 60 * 15;
const NO_EXPIRY = 0;
const TTL_MS = PREFETCH_MODE ? NO_EXPIRY : FIFTEEN_MINUTES;

function createR2Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Missing R2 environment variables. Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET",
    );
  }

  return new S3Client({ endpoint, accessKeyId, secretAccessKey, bucket });
}

let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = createR2Client();
  }
  return r2Client;
}

async function loadBookFromR2(bookSlug: string): Promise<CachedBookData> {
  const start = Date.now();
  const r2 = getR2Client();

  const embeddingsFile = r2.file(`answer-server-data/${bookSlug}/embeddings.json`);
  const richXmlFile = r2.file(`answer-server-data/${bookSlug}/rich.xml`);

  const [embeddingsExists, richXmlExists] = await Promise.all([embeddingsFile.exists(), richXmlFile.exists()]);

  if (!embeddingsExists) {
    throw new Error(`Embeddings not found for book: ${bookSlug}`);
  }
  if (!richXmlExists) {
    throw new Error(`rich.xml not found for book: ${bookSlug}`);
  }

  const [arr, richXml] = await Promise.all([
    embeddingsFile.json() as Promise<[number, DocumentWithEmbeddings[]][]>,
    richXmlFile.text(),
  ]);

  const embeddings = new Map(arr);
  const chapters = generateChaptersXmlFromRich(richXml);

  const stat = await embeddingsFile.stat();
  const sizeBytes = (stat?.size || 0) + richXml.length;
  const loadTime = Date.now() - start;

  console.log(`[EmbeddingManager] Loaded ${bookSlug} in ${loadTime}ms (${(sizeBytes / 1024 / 1024).toFixed(1)}MB)`);

  return { embeddings, richXml, chapters, sizeBytes, loadedAt: Date.now() };
}

export const bookCache = new LRUCache<string, CachedBookData>({
  maxSize: RAM_BUDGET,
  sizeCalculation: (entry: CachedBookData) => entry.sizeBytes,
  ttl: TTL_MS,

  fetchMethod: async (bookSlug: string) => {
    return await loadBookFromR2(bookSlug);
  },

  allowStale: true,
  allowStaleOnFetchRejection: true,

  dispose: (entry: CachedBookData, key: string, reason: string) => {
    console.log(`[EmbeddingManager] Evicted ${key} (${(entry.sizeBytes / 1024 / 1024).toFixed(1)}MB) - ${reason}`);
  },
});

export async function getBookData(bookSlug: string): Promise<CachedBookData> {
  const normalized = bookSlug.toLowerCase();
  const result = await bookCache.fetch(normalized);
  if (!result) {
    throw new Error(`Failed to load book data for: ${bookSlug}`);
  }
  return result;
}

export function prefetch(bookSlug: string): void {
  const normalized = bookSlug.toLowerCase();
  bookCache.fetch(normalized).catch((err: unknown) => {
    console.error(`[EmbeddingManager] Prefetch failed for ${bookSlug}:`, err);
  });
}

export function invalidate(bookSlug: string): boolean {
  const normalized = bookSlug.toLowerCase();
  return bookCache.delete(normalized);
}

export function getCacheStats(): { cachedBooks: string[]; cacheSize: string; memoryUsage: string; itemCount: number } {
  return {
    cachedBooks: [...bookCache.keys()],
    cacheSize: `${(bookCache.calculatedSize / 1024 / 1024).toFixed(1)}MB`,
    memoryUsage: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)}MB`,
    itemCount: bookCache.size,
  };
}

export function checkMemoryPressure(softLimitRatio = 0.8, targetRatio = 0.7): void {
  const rss = process.memoryUsage().rss;
  const softLimit = RAM_BUDGET * softLimitRatio;

  if (rss > softLimit) {
    console.warn(
      `[EmbeddingManager] Memory pressure: ${(rss / 1024 / 1024).toFixed(0)}MB (limit: ${(softLimit / 1024 / 1024).toFixed(0)}MB)`,
    );
    const targetRss = RAM_BUDGET * targetRatio;
    while (bookCache.size > 0 && process.memoryUsage().rss > targetRss) {
      bookCache.pop();
    }
  }
}

async function listBooksFromR2(): Promise<string[]> {
  const r2 = getR2Client();
  const result = await r2.list({ prefix: "answer-server-data/" });

  if (!result.contents) {
    return [];
  }

  const slugs = result.contents
    .map((obj) => obj.key.split("/")[1])
    .filter((slug): slug is string => Boolean(slug))
    .filter((slug, index, arr) => arr.indexOf(slug) === index);

  return slugs;
}

export async function prefetchAllBooks(): Promise<void> {
  if (!PREFETCH_MODE) {
    console.log("[EmbeddingManager] PREFETCH_ALL_BOOKS not enabled, skipping prefetch");
    return;
  }

  console.log(`[EmbeddingManager] Prefetch mode enabled (RAM budget: ${RAM_BUDGET_MB}MB)`);
  console.log("[EmbeddingManager] Loading all books from R2 sequentially...");

  const slugs = await listBooksFromR2();
  console.log(`[EmbeddingManager] Found ${slugs.length} books: ${slugs.join(", ")}`);

  let successful = 0;
  let failed = 0;

  for (const slug of slugs) {
    try {
      await bookCache.fetch(slug);
      successful++;
      const stats = getCacheStats();
      console.log(`[EmbeddingManager] Loaded ${slug} (${successful}/${slugs.length}) - Cache: ${stats.cacheSize}`);
    } catch (err) {
      failed++;
      console.error(`[EmbeddingManager] Failed to load ${slug}:`, err);
    }
  }

  console.log(`[EmbeddingManager] Prefetch complete. Loaded: ${successful}, Failed: ${failed}`);
  console.log(`[EmbeddingManager] Final cache stats: ${getCacheStats().cacheSize}`);
}
