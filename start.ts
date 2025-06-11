import { execSync } from "child_process";
import { generateBook } from "./generate-book";
import path from "path";
import fs from "fs";

async function start() {
  const args = process.argv.slice(2); // Skip node executable and script path

  if (args.length === 0) {
    console.error("Error: Please provide the path to the book directory.");
    console.log("Usage: pnpm start <path_to_book_directory>");
    console.log("Examples:");
    console.log("  pnpm start public_books/Krolowa-Sniegu");
    console.log("  pnpm start /absolute/path/to/book");
    console.log("  pnpm start C:\\Users\\username\\Desktop\\BookGenius\\1984");
    process.exit(1);
  }

  let bookDirectoryPath = args[0];

  const isWSL = process.platform === "linux" && fs.existsSync("/proc/version") && fs.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
  if (isWSL && bookDirectoryPath.match(/^[A-Za-z]:\\/)) {
    const driveLetter = bookDirectoryPath[0].toLowerCase();
    const pathWithoutDrive = bookDirectoryPath.slice(3); // Remove "C:\"
    bookDirectoryPath = `/mnt/${driveLetter}/${pathWithoutDrive.replace(/\\/g, "/")}`;
    console.log(`🔄 WSL2 detected: Translated Windows path to: ${bookDirectoryPath}`);
  }

  if (!path.isAbsolute(bookDirectoryPath)) {
    bookDirectoryPath = path.resolve(process.cwd(), bookDirectoryPath);
  }

  bookDirectoryPath = path.normalize(bookDirectoryPath);
  if (!fs.existsSync(bookDirectoryPath)) {
    console.error(`Error: Directory does not exist: ${bookDirectoryPath}`);
    process.exit(1);
  }

  const bookXmlPath = path.join(bookDirectoryPath, "book.xml");
  if (!fs.existsSync(bookXmlPath)) {
    console.error(`Error: book.xml not found at: ${bookXmlPath}`);
    console.error("Make sure the directory contains a valid book.xml file.");
    process.exit(1);
  }

  console.log(`📚 Starting application with book at: ${bookDirectoryPath}`);

  try {
    // Generate book data
    await generateBook(bookDirectoryPath);

    // Use JSON.stringify to properly escape the path for all platforms and handle spaces
    const command = `VITE_BOOK_DIR=${JSON.stringify(bookDirectoryPath)} pnpm exec vite dev`;

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
