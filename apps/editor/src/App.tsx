import "./App.css";
import { Sidebar } from "./components/Sidebar.tsx";
import { useEffect } from "react";
import { useBooksStore } from "./stores/booksStore.ts";
import { BookEditor } from "./components/BookEditor.tsx";
import { getCurrentChapterFromUrl } from "./utils/getCurrentChapterFromUrl.ts";
import { SSEProvider, useSSE } from "./contexts/SSEContext.tsx";
import { fetchBooks, fetchBookData } from "./api/bookApi.ts";
import { transformApiCharacters } from "./utils/characterTransform.ts";

const AppContent = () => {
  const { books, setBooks, currentBook, setChapters, setMetadata, setCurrentChapterContent, currentFile, chapters, setCharacters, setVariants } = useBooksStore();
  const eventSource = useSSE();

  const loadBooks = async () => {
    try {
      const booksData = await fetchBooks();
      setBooks(booksData);
    } catch (error) {
      console.error("[Error - Get-Books]", error);
    }
  };

  useEffect(() => {
    loadBooks();
  }, [setBooks]);

  // Listen for books-updated event
  useEffect(() => {
    if (!eventSource || !currentBook) return;

    const handleBooksUpdated = async (event: MessageEvent) => {
      const data = JSON.parse(event.data);

      if (data.type === "book-updated") {
        console.log("[SSE] Book updated, refetching...");
        try {
          const bookData = await fetchBookData(currentBook);
          setMetadata(bookData.metadata);
          setChapters(bookData.chapters);
          setCharacters(transformApiCharacters(bookData.characters));
          console.log("45: bookData.variants:", bookData.variants);
          setVariants(bookData.allVariants);
          // Use currentFile instead of getCurrentChapterFromUrl()
          if (currentFile && bookData.chapters[currentFile]) {
            setCurrentChapterContent(bookData.chapters[currentFile]);
          }
        } catch (error) {
          console.error("[Error - Get-Book-Data]", error);
        }
      }
    };

    eventSource.addEventListener("message", handleBooksUpdated);

    return () => {
      eventSource.removeEventListener("message", handleBooksUpdated);
    };
  }, [eventSource, currentBook, currentFile, setVariants, setMetadata, setChapters, setCharacters, setCurrentChapterContent]);

  useEffect(() => {
    const loadBookData = async () => {
      if (!currentBook) return;

      try {
        const data = await fetchBookData(currentBook);
        setMetadata(data.metadata);
        setChapters(data.chapters);
        setCharacters(transformApiCharacters(data.characters));
        setVariants(data.allVariants);
        setCurrentChapterContent(data.chapters[getCurrentChapterFromUrl()]);
      } catch (error) {
        console.error("[Error - Get-Book-Data]", error);
      }
    };

    loadBookData();
  }, [books, currentBook, setMetadata, setChapters, setCharacters, setCurrentChapterContent]);

  useEffect(() => {
    if (chapters && currentFile) {
      setCurrentChapterContent(chapters[currentFile] || "");
    }
  }, [currentFile]);

  return (
    <div className="app-container">
      <Sidebar />
      <BookEditor />
    </div>
  );
};

export const App = () => {
  return (
    <SSEProvider>
      <AppContent />
    </SSEProvider>
  );
};
