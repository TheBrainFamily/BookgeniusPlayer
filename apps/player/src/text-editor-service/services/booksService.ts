import { readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { parseStringPromise } from "xml2js";
import { Variant } from "@player/types/book";

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

  public async getBookData(
    bookName: string,
  ): Promise<{
    chapters: Record<string, string>;
    metadata: Record<string, string>;
    characters: Array<{ name: string; display: string; summary: string }>;
    bookMetadata: { slug?: string; title?: string; author?: string; language?: string; form?: string; simplifiedIconColor?: string };
    allVariants: {
      id: string;
      analysis: { originalSentence: string; reasoning: string; score: number };
      simplifications: { reasoning: string; score: number; sentences: string[] }[];
    }[];
  } | null> {
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

      // Parse metadata.xml if it exists to extract characters and book metadata
      const characters: Array<{ name: string; display: string; summary: string }> = [];
      const bookMetadata: { slug?: string; title?: string; author?: string; language?: string; form?: string; simplifiedIconColor?: string } = {};

      if (metadata.metadata) {
        try {
          const parsedXml = await parseStringPromise(metadata.metadata, { explicitArray: false, mergeAttrs: true });

          // Extract characters from CharactersMaster
          if (parsedXml?.ebook?.CharactersMaster) {
            const charactersMaster = parsedXml.ebook.CharactersMaster;
            Object.keys(charactersMaster).forEach((key) => {
              const char = charactersMaster[key];
              if (char && typeof char === "object" && char.display && char.summary) {
                characters.push({ name: key, display: char.display, summary: char.summary });
              }
            });
          }

          // Extract book metadata from BookMetadata
          if (parsedXml?.ebook?.BookMetadata) {
            const bookMeta = parsedXml.ebook.BookMetadata;
            bookMetadata.slug = bookMeta.Slug;
            bookMetadata.title = bookMeta.Title;
            bookMetadata.author = bookMeta.Author;
            bookMetadata.language = bookMeta.Language;
            bookMetadata.form = bookMeta.Form;
            bookMetadata.simplifiedIconColor = bookMeta.SimplifiedIconColor;
          }
        } catch (xmlError) {
          console.error("Error parsing metadata XML:", xmlError);
        }
      }

      const allVariants: Variant[] = await this.getAllVariants(bookName);

      return { chapters, metadata, characters, bookMetadata, allVariants };
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

  public async updateVariants(bookName: string, variant: Variant) {
    try {
      const getAllVariantsPath = path.join(process.cwd(), "public_books", bookName, "getAllVariants.ts");

      const allVariants: Variant[] = await this.getAllVariants(bookName);

      const updatedVariant = allVariants.find(({ id }) => id === variant.id);
      updatedVariant.analysis = variant.analysis;
      updatedVariant.simplifications = variant.simplifications;

      const result = `export const getAllVariants = () => ${JSON.stringify(allVariants, null, 2)};`;

      await writeFile(getAllVariantsPath, result, "utf-8");
      return true;
    } catch (error) {
      console.error(`Error updating variants for book ${bookName}:`, error);
      return false;
    }
  }

  private async getAllVariants(bookName: string): Promise<Variant[]> {
    try {
      const getAllVariantsPath = path.join(process.cwd(), "public_books", bookName, "getAllVariants.ts");

      const module = await import(getAllVariantsPath);

      return module.getAllVariants();
    } catch (fileError) {
      console.error(`Error reading getAllVariants.ts for ${bookName}:`, fileError);
      return [];
    }
  }
}
