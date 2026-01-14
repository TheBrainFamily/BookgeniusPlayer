import path from "path";

let overrideBookPath: string | undefined;

export function setCurrentBook(bookPath: string) {
  overrideBookPath = bookPath;
}

function getCliBookSelection(): string | undefined {
  return process.argv?.[2];
}

export const getCurrentBook = (): string => {
  const fromOverride = overrideBookPath;
  const fromEnv = process.env.BOOK_PATH || process.env.BOOK_SLUG;
  const fromCli = getCliBookSelection();

  const selected = fromOverride || fromEnv || fromCli;
  if (selected) return selected as string;

  throw new Error("No book selected");
};

/**
 * Returns the book slug (the last directory name) from the current book path.
 * Example: "books-data/romeo-and-juliet/" => "romeo-and-juliet"
 */
export const getCurrentBookSlug = (): string => {
  const bookPath = getCurrentBook();
  return path.basename(path.resolve(bookPath));
};
