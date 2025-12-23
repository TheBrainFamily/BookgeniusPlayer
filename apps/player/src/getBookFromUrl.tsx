export function getBookFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("book");
  } catch {
    return null;
  }
}
