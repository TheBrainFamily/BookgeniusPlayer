import { BooksService } from "@/text-editor-service/services/booksService";
import { RequestHandler } from "express";

export class BooksController {
  private booksService: BooksService;

  constructor() {
    this.booksService = new BooksService();
  }

  public getBooks: RequestHandler = async (req, res) => {
    try {
      const books = await this.booksService.getBooks();
      res.json({ books });
    } catch (error) {
      console.error("Error in getBooks controller:", error);
      res.status(500).json({ error: "Failed to fetch books" });
    }
  };

  public getBookData: RequestHandler = async (req, res) => {
    try {
      const { bookName } = req.params;

      if (!bookName) {
        res.status(400).json({ error: "Book name is required" });
        return;
      }

      const bookData = await this.booksService.getBookData(bookName);

      if (!bookData) {
        res.status(404).json({ error: "Book not found or no content available" });
        return;
      }

      res.json(bookData);
    } catch (error) {
      console.error("Error in getBookData controller:", error);
      res.status(500).json({ error: "Failed to fetch book data" });
    }
  };

  public updateChapter: RequestHandler = async (req, res) => {
    try {
      const { bookName, chapterFile, content } = req.body;

      if (!bookName || !chapterFile || !content) {
        res.status(400).json({ error: "bookName, chapterFile, and content are required" });
        return;
      }

      const success = await this.booksService.updateChapter(bookName, chapterFile, content);

      if (!success) {
        res.status(500).json({ error: "Failed to update chapter" });
        return;
      }

      res.json({ message: "Chapter updated successfully" });
    } catch (error) {
      console.error("Error in updateChapter controller:", error);
      res.status(500).json({ error: "Failed to update chapter" });
    }
  };
}
