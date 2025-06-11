import fs from "fs";
import path from "path";

interface BookDirectoryInfo {
  bookDirectoryPath: string;
  bookXmlPath: string;
}

export function validateAndNormalizeBookPath(args: string[]): BookDirectoryInfo {
  if (args.length === 0) {
    console.error("Error: Please provide the path to the book directory.");
    console.log("Usage: pnpm start/build <path_to_book_directory>");
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

  return { bookDirectoryPath, bookXmlPath };
}
