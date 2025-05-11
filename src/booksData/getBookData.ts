import { BookData } from "./types";
import { CURRENT_BOOK } from "@/consts";

export async function getBookData(): Promise<BookData> {
  const module = await import(`./books/${CURRENT_BOOK.toLowerCase()}BookData.ts`);
  return module.bookData;
}
