#!/usr/bin/env bun
import { callGeminiWithThinkingAndSchemaAndParsed } from "../callFastGemini";
import { z } from "zod";
import fs from "fs";
import path from "path";

const BookDescriptionSchema = z.object({
  description: z
    .string()
    .describe(
      "A catchy, engaging description (2-3 sentences max) that would make someone want to read this book",
    ),
  hook: z.string().describe("A one-liner hook/tagline for the book"),
});

type BookDescription = z.infer<typeof BookDescriptionSchema>;

interface BookInput {
  title: string;
  author: string;
  epoch?: string;
  genre?: string;
  kind?: string;
  collectionTitle?: string;
}

export async function generateBookDescription(book: BookInput): Promise<BookDescription> {
  const prompt = `You are a literary marketing expert. Generate a compelling, catchy description for this book that would encourage someone to read it.

Book: "${book.title}" by ${book.author}
${book.epoch ? `Literary period: ${book.epoch}` : ""}
${book.genre ? `Genre: ${book.genre}` : ""}
${book.kind ? `Type: ${book.kind}` : ""}
${book.collectionTitle ? `Collection: "${book.collectionTitle}"` : ""}

Requirements:
- The description should be 2-3 sentences MAX, punchy and engaging
- Focus on what makes this book interesting/compelling
- Don't spoil the plot, just intrigue the reader
- The hook should be a memorable one-liner (think movie tagline)
${book.collectionTitle ? `- The reader is already browsing the "${book.collectionTitle}" collection, so DON'T repeat the collection theme in the hook - instead focus on what makes THIS specific book unique and stand out from others in the collection` : ""}
- Write in the same language as the book title (if Polish title, write in Polish)
- Be accurate about the book's content - don't make things up if you don't know the book`;

  return callGeminiWithThinkingAndSchemaAndParsed(prompt, BookDescriptionSchema);
}

interface WLBook {
  title: string;
  author: string;
  slug: string;
  epoch?: string;
  genre?: string;
  kind?: string;
}

interface CollectionData {
  slug: string;
  title: string;
  books: WLBook[];
}

interface BookWithDescription extends WLBook {
  generatedDescription: string;
  generatedHook: string;
}

async function processCollection(
  collectionSlug: string,
  limit: number = 10,
  parallel: boolean = false,
): Promise<BookWithDescription[]> {
  const collectionsDir = path.resolve(__dirname, "../../wolnelektury-data/collections");
  const collectionPath = path.join(collectionsDir, `${collectionSlug}.json`);

  if (!fs.existsSync(collectionPath)) {
    throw new Error(`Collection not found: ${collectionSlug}`);
  }

  const collection: CollectionData = JSON.parse(fs.readFileSync(collectionPath, "utf-8"));
  const booksToProcess = collection.books.slice(0, limit);

  console.log(
    `\nProcessing ${booksToProcess.length} books from "${collection.title}"${parallel ? " (parallel)" : ""}...\n`,
  );

  if (parallel) {
    const results = await Promise.all(
      booksToProcess.map(async (book, i) => {
        try {
          const description = await generateBookDescription({
            title: book.title,
            author: book.author,
            epoch: book.epoch,
            genre: book.genre,
            kind: book.kind,
            collectionTitle: collection.title,
          });
          console.log(`✓ [${i + 1}/${booksToProcess.length}] "${book.title}"`);
          return {
            ...book,
            generatedDescription: description.description,
            generatedHook: description.hook,
          };
        } catch (error) {
          console.error(`✗ [${i + 1}/${booksToProcess.length}] "${book.title}" - ${error}`);
          return { ...book, generatedDescription: "", generatedHook: "" };
        }
      }),
    );
    return results;
  }

  const results: BookWithDescription[] = [];
  for (let i = 0; i < booksToProcess.length; i++) {
    const book = booksToProcess[i];
    console.log(`[${i + 1}/${booksToProcess.length}] "${book.title}" by ${book.author}...`);

    try {
      const description = await generateBookDescription({
        title: book.title,
        author: book.author,
        epoch: book.epoch,
        genre: book.genre,
        kind: book.kind,
        collectionTitle: collection.title,
      });

      results.push({
        ...book,
        generatedDescription: description.description,
        generatedHook: description.hook,
      });

      console.log(`  Hook: "${description.hook}"`);
      console.log(`  Description: ${description.description}\n`);
    } catch (error) {
      console.error(`  Failed: ${error}`);
      results.push({ ...book, generatedDescription: "", generatedHook: "" });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return results;
}

async function main() {
  const collectionSlug = process.argv[2] || "sherlock-holmes";
  const limit = parseInt(process.argv[3] || "10", 10);

  console.log("=".repeat(60));
  console.log("BOOK DESCRIPTION GENERATOR");
  console.log("=".repeat(60));
  console.log(`Collection: ${collectionSlug}`);
  console.log(`Limit: ${limit} books`);

  const results = await processCollection(collectionSlug, limit);

  const outputDir = path.resolve(__dirname, "../../wolnelektury-data/generated-descriptions");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${collectionSlug}-descriptions.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log("\n" + "=".repeat(60));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(60));
  console.log(`Processed: ${results.length} books`);
  console.log(`Successful: ${results.filter((r) => r.generatedDescription).length}`);
  console.log(`Output saved to: ${outputPath}`);
}

if (require.main === module) {
  main().catch(console.error);
}
