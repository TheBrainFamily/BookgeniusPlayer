import { VoyageAIClient } from "voyageai";
import "dotenv/config";
import { getParagraphsFromChapter } from "../../tools/createParagraphsWithPageNumbers";
import { DocumentWithEmbeddings, Document } from "./create-paragraph-embeddings";
import { writeBookFile } from "../../helpers/writeBookFile";
import { getBookSettings } from "../../helpers/getBookSettings";
import { ScenesSummariesPerChapter } from "../../tools/new-tooling/get-chapter-by-chapter-with-paragraphs-json-summary";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { readBookFile } from "../../helpers/readBookFile";

const computeBatchEmbeddingsThroughHTTP = async (documents: Document[]): Promise<DocumentWithEmbeddings[]> => {
  const client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
  const res = await client.contextualizedEmbed({
    inputs: [documents.map((document) => document.text)],
    model: "voyage-context-3",
    inputType: "document",
  });
  console.log("res", res);
  const documentsWithEmbeddings = documents.map((document, index) => {
    return { ...document, Embeddings: res.data?.[0]?.data?.[index]?.embedding ?? [] };
  });
  return documentsWithEmbeddings;
};

const generateEmbeddingsSimplified = async (chaptersFrom: number, chaptersTo: number) => {
  const embeddingsForChapters: Map<number, DocumentWithEmbeddings[]> = new Map();

  for (let chapter = chaptersFrom; chapter <= chaptersTo; chapter++) {
    const paragraphsFromChapter: { text: string; dataIndex: number }[] = getParagraphsFromChapter(chapter, true, true);
    const documents: Document[] = paragraphsFromChapter.map((paragraph) => {
      return { text: paragraph.text, chapter: chapter, paragraphNumber: paragraph.dataIndex };
    });
    const documentsWithEmbeddings = await computeBatchEmbeddingsThroughHTTP(documents);
    embeddingsForChapters.set(chapter, documentsWithEmbeddings);
  }

  writeBookFile("embeddings.json", JSON.stringify(Array.from(embeddingsForChapters.entries()), null, 2));

  return embeddingsForChapters;
};

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
    const documents: Document[] = chapterData.chapterSummary.chapterBulletPoints.map((bulletPoint) => {
      return {
        text: `<Summary>${bulletPoint.paragraphsSummary}</Summary> <Text>${bulletPoint.paragraphNumbers
          .map((p) =>
            paragraphsFromChapter
              .filter((pfc) => pfc.dataIndex === p)
              ?.map((pfc) => pfc.text)
              .join(" "),
          )
          .join(" ")}</Text>`,
        chapter: chapter,
        paragraphNumber: bulletPoint.mainParagraphNumber,
      };
    });

    const moreDocuments: Document[] = chapterData.chapterSummary.chapterBulletPoints.map((bulletPoint) => {
      return {
        text: `${bulletPoint.paragraphsSummary}`,
        chapter: chapter,
        paragraphNumber: bulletPoint.mainParagraphNumber,
      };
    });
    const documentsWithEmbeddings = await computeBatchEmbeddingsThroughHTTP(documents);
    const moreDocumentsWithEmbeddings = await computeBatchEmbeddingsThroughHTTP(moreDocuments);
    embeddingsForChapters.set(chapter, [...documentsWithEmbeddings, ...moreDocumentsWithEmbeddings]);
  }

  writeBookFile("embeddings.json", JSON.stringify(Array.from(embeddingsForChapters.entries()), null, 2));

  return embeddingsForChapters;
};

const run = async () => {
  const booksSettings = getBookSettings();

  await generateEmbeddings(1, booksSettings.numberOfChaptersToProcess);
  // await generateEmbeddings(1, 3);
};

run();
