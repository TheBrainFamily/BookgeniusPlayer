import { execSync } from "child_process";
import { generateBook } from "./generate-book";

async function start() {
  const args = process.argv.slice(2); // Skip node executable and script path

  if (args.length === 0) {
    console.error("Error: Please provide the path to the book directory.");
    console.log("Usage: pnpm start <path_to_book_directory>");
    process.exit(1);
  }

  const bookDirectoryPath = args[0];

  try {
    // Generate book data
    const { bookSlug, bookTitle } = await generateBook(bookDirectoryPath);

    // Ensure book names with spaces are handled correctly by quoting.
    const command = `VITE_BOOK='${bookSlug}' VITE_BOOK_NAME='${bookTitle.replace(/'/g, "'\\''")}' VITE_BOOK_PATH='${bookDirectoryPath}' vite dev`;

    console.log(`🚀 Executing: ${command}`);

    execSync(command, { stdio: "inherit" });
  } catch (error) {
    console.error(`Error starting the development server for ${bookDirectoryPath}:`);
    if (error instanceof Error) {
      console.error("Message:", error.message);
    } else {
      console.error("An unknown error occurred:", error);
    }
    process.exit(1);
  }
}

start();
