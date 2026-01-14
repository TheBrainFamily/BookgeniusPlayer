export function getBookFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const book = params.get("book");
    if (!book) {
      console.error("no book in url");
      throw new Error("no book in url");
    }
    return book;
  } catch {
    console.error("error getting book from url");
    throw new Error("error getting book from url");
  }
}
