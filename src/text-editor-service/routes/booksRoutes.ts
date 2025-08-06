import { Router } from "express";
import { BooksController } from "@/text-editor-service/controllers/booksController";

const router = Router();
const booksController = new BooksController();

router.get("/get-books", booksController.getBooks);
router.get("/get-book-data/:bookName", booksController.getBookData);
router.post("/update-chapter", booksController.updateChapter);

export default router;
