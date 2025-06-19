import { execSync } from "child_process";

import { generateBook } from "./generateBook";
import { validateAndNormalizeBookPath } from "./validateAndNormalizeBookPath";

async function build() {
  const args = process.argv.slice(2);
  const { bookDirectoryPath } = validateAndNormalizeBookPath(args);

  console.log(`📚 Building application with book at: ${bookDirectoryPath}`);

  try {
    console.log(`🔨 Generating book data for ${bookDirectoryPath}...`);
    const { bookSlug, bookTitle } = await generateBook(bookDirectoryPath);
    console.log(`🎉 Book generation completed for ${bookSlug} (${bookTitle})`);

    const command = `VITE_BOOK_DIR=${JSON.stringify(bookDirectoryPath)} pnpm exec vite build`;
    console.log(`🚀 Executing: ${command}`);
    execSync(command, { stdio: "inherit" });

    console.log(`✅ Build completed successfully for ${bookSlug}`);
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

build();
