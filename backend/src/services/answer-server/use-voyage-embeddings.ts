import { VoyageAIClient } from "voyageai";
import { DocumentWithEmbeddings } from "./create-paragraph-embeddings";
import { readBookFile } from "../../helpers/readBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { Filter, shouldAllowDocument } from "./answer-server";

type ChapterEmbeddingsEntries = Array<[number, DocumentWithEmbeddings[]]>;
type BookEmbeddings = Map<number, DocumentWithEmbeddings[]>;

export async function findBestPassages(
  queryEmbedding: number[],
  documents: DocumentWithEmbeddings[],
  filter?: Filter,
  maxResults: number = 6,
  similarityThreshold: number = 0.75, // Relative threshold as a fraction of highest score
): Promise<(DocumentWithEmbeddings & { score: number })[]> {
  // Compute dot products
  const dotProducts = documents
    .filter((doc) => shouldAllowDocument(doc, filter))
    .map((doc) => doc.Embeddings.reduce((sum, val, idx) => sum + val * queryEmbedding[idx], 0));

  // Create pairs of [index, score] and sort by score in descending order
  const indexedScores = dotProducts.map((score, index) => [index, score] as [number, number]);
  indexedScores.sort((a, b) => b[1] - a[1]); // Sort by score descending

  // Get the highest similarity score
  console.log("indexedScores", indexedScores[0]);
  const highestScore = indexedScores[0][1];

  // Get documents above threshold, limited to maxResults
  const results: (DocumentWithEmbeddings & { score: number })[] = [];

  for (const [index, score] of indexedScores) {
    // Check if this document's score is above the relative threshold
    if (score >= highestScore * similarityThreshold && results.length < maxResults) {
      results.push({ ...documents[index], score });
    }
    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}

const computeEmbedding = async (query: string) => {
  const client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
  const res = await client.contextualizedEmbed({ inputs: [[query]], model: "voyage-context-3", inputType: "query" });
  return res.data?.[0]?.data?.[0]?.embedding ?? [];
};

export const useVoyageEmbeddings = async (query: string) => {
  const embeddingsEntries: BookEmbeddings = new Map(
    JSON.parse(readBookFile("embeddings.json", FILE_TYPE.TEMPORARY)) as ChapterEmbeddingsEntries,
  );
  const embedding = await computeEmbedding(query);
  return findBestPassages(embedding, Array.from(embeddingsEntries.values()).flat(), {
    chapterFrom: 1,
    chapterTo: 50,
    bookSlug: "Fatherland",
  });
};

if (require.main === module) {
  const query = process.argv[2];
  console.log("query", query);
  useVoyageEmbeddings(query).then((embeddings) => {
    console.log("embeddings", embeddings);
  });
}
