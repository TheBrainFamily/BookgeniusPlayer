import fs from "fs";
import path from "path";
import chokidar from "chokidar";

const contentDir = "booksContent/";
export function rebuildBook(bookPath: string) {
  try {
    // Read metadata
    const metadataPath = path.join(bookPath, contentDir, "metadata.xml");
    let metadata = fs.readFileSync(metadataPath, "utf8");

    // Remove the closing </ebook> and trim trailing whitespace
    metadata = metadata.trimEnd();
    const closingTag = "</ebook>";
    if (metadata.endsWith(closingTag)) {
      metadata = metadata.slice(0, -closingTag.length).trimEnd();
    } else {
      throw new Error("Metadata does not end with </ebook>");
    }

    // Get and sort chapter files numerically
    const files = fs.readdirSync(path.join(bookPath, contentDir));
    const chapterFiles = files.filter((f) => /^chapter\d+\.xml$/.test(f));
    chapterFiles.sort((a, b) => {
      const numA = parseInt(a.match(/^chapter(\d+)\.xml$/)?.[1] || "0", 10);
      const numB = parseInt(b.match(/^chapter(\d+)\.xml$/)?.[1] || "0", 10);
      return numA - numB;
    });

    // Read and trim chapters
    const chapters = chapterFiles.map((f) =>
      fs.readFileSync(path.join(bookPath, contentDir, f), "utf8").trim(),
    );

    // Combine into book content
    const bookContent = metadata + "\n\n" + chapters.join("\n\n") + "\n\n" + closingTag + "\n";
    const outputFile = path.join(bookPath, "book.xml");

    fs.writeFileSync(outputFile, bookContent, "utf8");
    console.log("book.xml rebuilt");
  } catch (err) {
    console.error("Error rebuilding book.xml:", err);
  }
}

// Initial build

if (require.main === module) {
  const bookPath = process.argv[2];
  if (bookPath) {
    rebuildBook(bookPath);
    // Watch for changes
    const watcher = chokidar.watch(path.join(bookPath, contentDir), {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
    });

    watcher.on("change", (filePath) => {
      const filename = path.basename(filePath);
      if (filename === "metadata.xml" || /^chapter\d+\.xml$/.test(filename)) {
        console.log(`${filename} changed, rebuilding...`);
        rebuildBook(bookPath);
      }
    });
  } else {
    const publicBooksDir = "public_books";

    fs.readdirSync(publicBooksDir).forEach((folder) => {
      const bookFolder = path.join(publicBooksDir, folder);
      const stats = fs.statSync(bookFolder);
      if (stats.isDirectory()) {
        console.log(`Processing book: ${folder}`);
        rebuildBook(bookFolder);
      }
    });
  }
}
