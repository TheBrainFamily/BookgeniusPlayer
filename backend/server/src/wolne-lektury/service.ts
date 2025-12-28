import type { WLCollectionSummary, WLCollectionDetails, WLBook, WLBookDetails } from "./types";

const API_URL = "https://wolnelektury.pl/api";

function extractSlugFromHref(href: string): string {
  const match = href.match(/\/api\/(?:collections|books)\/([^/]+)\/?$/);
  return match ? match[1] : href;
}

export async function getCollections(): Promise<WLCollectionSummary[]> {
  const response = await fetch(`${API_URL}/collections/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch collections: ${response.status}`);
  }
  return response.json();
}

export async function getCollectionBySlug(slug: string): Promise<WLCollectionDetails> {
  const response = await fetch(`${API_URL}/collections/${slug}/`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Collection "${slug}" not found`);
    }
    throw new Error(`Failed to fetch collection: ${response.status}`);
  }
  return response.json();
}

export async function searchBooks(query: string): Promise<WLBook[]> {
  const response = await fetch(`${API_URL}/books/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch books: ${response.status}`);
  }
  const allBooks = (await response.json()) as WLBook[];
  const lowerQuery = query.toLowerCase();
  return allBooks.filter((book) => book.title.toLowerCase().includes(lowerQuery) || book.author.toLowerCase().includes(lowerQuery));
}

export async function getBookBySlug(slug: string): Promise<WLBookDetails> {
  const response = await fetch(`${API_URL}/books/${slug}/`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Book "${slug}" not found`);
    }
    throw new Error(`Failed to fetch book: ${response.status}`);
  }
  return response.json();
}

export async function downloadBookFb2(slug: string): Promise<{ buffer: Buffer; details: WLBookDetails }> {
  const details = await getBookBySlug(slug);
  if (!details.fb2) {
    throw new Error(`Book "${slug}" does not have FB2 format available`);
  }

  const fb2Response = await fetch(details.fb2);
  if (!fb2Response.ok) {
    throw new Error(`Failed to download FB2: ${fb2Response.status}`);
  }

  const buffer = Buffer.from(await fb2Response.arrayBuffer());
  return { buffer, details };
}

export { extractSlugFromHref };
