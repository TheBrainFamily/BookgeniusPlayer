import { execSync } from "child_process";
import { generateBook } from "./generate-book";

async function buildWithBook() {
  const args = process.argv.slice(2); // Skip node executable and script path

  if (args.length === 0) {
    console.error("Error: Please provide the path to the book directory.");
    console.log("Usage: pnpm build <path_to_book_directory>");
    process.exit(1);
  }

  const bookDirectoryPath = args[0];

  try {
    console.log(`🔨 Generating book data for ${bookDirectoryPath}...`);

    // Generate book data first
    await generateBook(bookDirectoryPath);

    console.log(`🏗️  Building application...`);

    // Set the book directory and run the build
    const command = `VITE_BOOK_DIR='${bookDirectoryPath}' vite build`;
    execSync(command, { stdio: "inherit" });

    console.log(`✅ Build completed successfully for ${bookDirectoryPath}`);
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
