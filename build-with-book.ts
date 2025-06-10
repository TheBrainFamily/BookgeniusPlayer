import { execSync } from "child_process";
import { generateBook } from "./generate-book";

async function buildWithBook() {
  // Get environment variables
  const VITE_BOOK = process.env.VITE_BOOK;
  const VITE_BOOK_NAME = process.env.VITE_BOOK_NAME;
  const VITE_BOOK_PATH = process.env.VITE_BOOK_PATH;

  if (!VITE_BOOK || !VITE_BOOK_NAME || !VITE_BOOK_PATH) {
    console.error("❌ Missing required environment variables:");
    if (!VITE_BOOK) console.error("  - VITE_BOOK is not set");
    if (!VITE_BOOK_NAME) console.error("  - VITE_BOOK_NAME is not set");
    if (!VITE_BOOK_PATH) console.error("  - VITE_BOOK_PATH is not set");
    console.error("\nPlease set these environment variables before building:");
    console.error("Example: VITE_BOOK='Snow-Queen' VITE_BOOK_NAME='Snow Queen' VITE_BOOK_PATH='./public_books/Snow-Queen' pnpm build");
    process.exit(1);
  }

  try {
    console.log(`🔨 Generating book data for ${VITE_BOOK}...`);

    // Generate book data first
    await generateBook(VITE_BOOK_PATH);

    console.log(`🏗️  Building application...`);

    // Now run the actual build
    execSync("vite build", { stdio: "inherit" });

    console.log(`✅ Build completed successfully for ${VITE_BOOK}`);
  } catch (error) {
    console.error(`❌ Build failed:`);
    if (error instanceof Error) {
      console.error("Message:", error.message);
    } else {
      console.error("An unknown error occurred:", error);
    }
    process.exit(1);
  }
}

buildWithBook();
