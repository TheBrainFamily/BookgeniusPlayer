#!/usr/bin/env bun
import { callGeminiWithThinkingAndSchemaAndParsed } from "../callFastGemini";
import { z } from "zod";
import fs from "fs";
import path from "path";
import PQueue from "p-queue";

const BookDescriptionSchema = z.object({
  description: z
    .string()
    .describe(
      "A catchy, engaging description (2-3 sentences max) that would make someone want to read this book",
    ),
  hook: z.string().describe("A one-liner hook/tagline for the book"),
});

type BookDescription = z.infer<typeof BookDescriptionSchema>;

interface SEBook {
  slug: string;
  title: string;
  author: string;
  authorFileAs: string;
  description: string;
  longDescription: string;
  wordCount: number;
  subjects: string[];
}

interface SEIndex {
  books: SEBook[];
}

async function generateBookDescription(book: SEBook): Promise<BookDescription> {
  const prompt = `You are a literary marketing expert. Generate a compelling, catchy description for this book that would encourage someone to read it.

Book: "${book.title}" by ${book.author}
${book.subjects.length > 0 ? `Subjects: ${book.subjects.join(", ")}` : ""}
${book.description ? `Official description: ${book.description}` : ""}

Requirements:
- The description should be 2-3 sentences MAX, punchy and engaging
- Focus on what makes this book interesting/compelling
- Don't spoil the plot, just intrigue the reader
- The hook should be a memorable one-liner (think movie tagline)
- Write in English
- Be accurate about the book's content - don't make things up if you don't know the book`;

  return callGeminiWithThinkingAndSchemaAndParsed(prompt, BookDescriptionSchema);
}

async function main() {
  const concurrency = parseInt(process.argv[2] || "100", 10);

  const indexPath = path.resolve(__dirname, "../../standardebooks-data/index.json");
  const outputPath = path.resolve(__dirname, "../../standardebooks-data/descriptions.json");

  if (!fs.existsSync(indexPath)) {
    console.error("Standard Ebooks index not found. Run the downloader first.");
    process.exit(1);
  }

  const index: SEIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));

  let existing: Record<string, { description: string; hook: string }> = {};
  if (fs.existsSync(outputPath)) {
    existing = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  }

  const booksToProcess = index.books.filter((book) => !existing[book.slug]);

  console.log("=".repeat(60));
  console.log("STANDARD EBOOKS DESCRIPTION GENERATOR");
  console.log("=".repeat(60));
  console.log(`Total books in index: ${index.books.length}`);
  console.log(`Already generated: ${Object.keys(existing).length}`);
  console.log(`Remaining to process: ${booksToProcess.length}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log("=".repeat(60));

  if (booksToProcess.length === 0) {
    console.log("All books already have descriptions!");
    return;
  }

  const queue = new PQueue({ concurrency });
  let succeeded = 0;
  let failed = 0;

  const tasks = booksToProcess.map((book) =>
    queue.add(async () => {
      try {
        const desc = await generateBookDescription(book);
        existing[book.slug] = { description: desc.description, hook: desc.hook };
        succeeded++;

        if (succeeded % 10 === 0) {
          fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));
        }

        const total = succeeded + failed;
        const remaining = booksToProcess.length - total;
        process.stdout.write(
          `\r[${Object.keys(existing).length}/${index.books.length}] ✓${succeeded} ✗${failed} | ${remaining} remaining...`,
        );
      } catch (e) {
        failed++;
        console.error(`\n✗ ${book.slug}: ${e}`);
      }
    }),
  );

  await Promise.all(tasks);

  fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total in output: ${Object.keys(existing).length}`);
  console.log(`Output: ${outputPath}`);
}

main().catch(console.error);
