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
    await generateBook(bookDirectoryPath);

    const command = `VITE_BOOK_DIR='${bookDirectoryPath}' vite dev`;

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
