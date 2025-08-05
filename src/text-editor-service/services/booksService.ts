import { readdir, readFile, writeFile } from "fs/promises";
import path from "path";

export class BooksService {
  public async getBooks(): Promise<string[]> {
    try {
      const publicBooksPath = path.join(process.cwd(), "public_books");
      const directories = await readdir(publicBooksPath, { withFileTypes: true });
      return directories.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
    } catch (error) {
      console.error("Error reading books directory:", error);
      return [];
    }
  }

  public async getBookData(bookName: string): Promise<{ chapters: Record<string, string>; metadata: Record<string, string> } | null> {
    try {
      const booksContentPath = path.join(process.cwd(), "public_books", bookName, "booksContent");
      const files = await readdir(booksContentPath, { withFileTypes: true });
      const xmlFiles = files.filter((file) => file.isFile() && file.name.endsWith(".xml"));

      const chapters: Record<string, string> = {};
      const metadata: Record<string, string> = {};

      // Separate chapter files from other files
      const chapterFiles = xmlFiles.filter((file) => file.name.match(/chapter(\d+)\.xml/));
      const metadataFiles = xmlFiles.filter((file) => !file.name.match(/chapter(\d+)\.xml/));

      // Sort chapter files by number
      chapterFiles.sort((a, b) => {
        const aMatch = a.name.match(/chapter(\d+)\.xml/);
        const bMatch = b.name.match(/chapter(\d+)\.xml/);
        return parseInt(aMatch![1]) - parseInt(bMatch![1]);
      });

      // Sort metadata files alphabetically
      metadataFiles.sort((a, b) => a.name.localeCompare(b.name));

      // Read chapter files
      for (const file of chapterFiles) {
        const filePath = path.join(booksContentPath, file.name);
        const content = await readFile(filePath, "utf-8");
        const fileName = file.name.replace(".xml", "");
        chapters[fileName] = content;
      }

      // Read metadata files
      for (const file of metadataFiles) {
        const filePath = path.join(booksContentPath, file.name);
        const content = await readFile(filePath, "utf-8");
        const fileName = file.name.replace(".xml", "");
        metadata[fileName] = content;
      }

      return { chapters, metadata };
    } catch (error) {
      console.error(`Error reading book data for ${bookName}:`, error);
      return null;
    }
  }

  public async updateChapter(bookName: string, chapterFile: string, content: string): Promise<boolean> {
    try {
      const fileName = chapterFile.endsWith(".xml") ? chapterFile : `${chapterFile}.xml`;
      const filePath = path.join(process.cwd(), "public_books", bookName, "booksContent", fileName);

      await writeFile(filePath, content, "utf-8");
      return true;
    } catch (error) {
      console.error(`Error updating chapter ${chapterFile} for book ${bookName}:`, error);
      return false;
    }
  }
}
