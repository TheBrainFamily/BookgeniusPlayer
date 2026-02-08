import { GoogleGenAI } from "@google/genai";

// const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY as string);
// const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });

export type Document = { text: string; chapter: number; paragraphNumber: number };
export type DocumentWithEmbeddings = Document & { Embeddings: number[] };
export type BookEmbeddings = Map<number, DocumentWithEmbeddings[]>;

export async function computeEmbeddingsThroughHttp(
  document: Document,
): Promise<DocumentWithEmbeddings> {
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
