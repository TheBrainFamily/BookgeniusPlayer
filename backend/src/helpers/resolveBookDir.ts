import path from "path";
import fs from "fs";
import { getCurrentBook } from "./getCurrentBook";

export const resolveBookDir = (bookSlug = getCurrentBook()): string => {
  if (!bookSlug) {
    throw new Error("Book slug must be provided to the function or be provided as the first command line argument");
  }
  let bookBaseFullAbsolutePath = path.join(__dirname, "../../", bookSlug);
  if (fs.existsSync(bookBaseFullAbsolutePath)) {
    return bookBaseFullAbsolutePath;
  }

  bookBaseFullAbsolutePath = path.join(__dirname, bookSlug);
  if (fs.existsSync(bookBaseFullAbsolutePath)) {
    return bookBaseFullAbsolutePath;
  }

  throw new Error(`Dir not found, ${bookBaseFullAbsolutePath}`);
};
