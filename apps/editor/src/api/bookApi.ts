export const fetchBooks = async () => {
  const response = await fetch('http://localhost:3000/api/books/get-books');

  if (!response.ok) {
    throw new Error(`Failed to fetch books: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.books;
};

export const fetchBookData = async (bookName: string) => {
  const response = await fetch(`http://localhost:3000/api/books/get-book-data/${bookName}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch book data: ${response.status} ${response.statusText}`);
  }

  return await response.json();
};