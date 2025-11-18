import { generateBook } from "./generateBook";
import { validateAndNormalizeBookPath } from "@player/scripts/validateAndNormalizeBookPath";

async function regenerateBook() {
  const args = process.argv.slice(2);
  const { bookDirectoryPath } = validateAndNormalizeBookPath(args);

  console.log(`📚 Regenerating book at: ${bookDirectoryPath}`);

  try {
    console.log(`🔨 Generating book data for ${bookDirectoryPath}...`);
    const { bookSlug, bookTitle, bookLanguage } = await generateBook(bookDirectoryPath);
    console.log(`🎉 Book generation completed for ${bookSlug} (${bookTitle}) - Language: ${bookLanguage}`);
  } catch (error) {
    console.error(`❌ Start failed:`);

    if (error instanceof Error) {
      console.error("Message:", error.message);
    } else {
      console.error("An unknown error occurred:", error);
    }

    process.exit(1);
  }
}

regenerateBook();
