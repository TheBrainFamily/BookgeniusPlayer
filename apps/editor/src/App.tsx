import "./App.css";
import { Sidebar } from "./components/Sidebar.tsx";
import { useEffect, useState, useCallback } from "react";
import { useBooksStore } from "./stores/booksStore.ts";
import { BookEditor } from "./components/BookEditor.tsx";
import { VariantSidebar } from "./components/VariantSidebar.tsx";
import { ChangesView } from "./components/ChangesView.tsx";
import { getCurrentChapterFromUrl } from "./utils/getCurrentChapterFromUrl.ts";
import { getCurrentViewFromUrl } from "./utils/updateUrlView.ts";
import { SSEProvider, useSSE } from "./contexts/SSEContext.tsx";
import { fetchBooks, fetchBookData } from "./api/bookApi.ts";
import { transformApiCharacters } from "./utils/characterTransform.ts";

const AppContent = () => {
  const { books, setBooks, currentBook, setChapters, setMetadata, setCurrentChapterContent, currentFile, chapters, setCharacters, setVariants } = useBooksStore();
  const eventSource = useSSE();
  const [currentView, setCurrentView] = useState(getCurrentViewFromUrl());

  // Listen for URL changes to update the current view
  useEffect(() => {
    const handleUrlChange = () => {
      setCurrentView(getCurrentViewFromUrl());
    };

    const handleViewChange = () => {
      setCurrentView(getCurrentViewFromUrl());
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('viewchange', handleViewChange);
    
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('viewchange', handleViewChange);
    };
  }, []);

  const loadBooks = useCallback(async () => {
    try {
      const booksData = await fetchBooks();
      setBooks(booksData);
    } catch (error) {
      console.error("[Error - Get-Books]", error);
    }
  }, [setBooks]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  // Listen for books-updated event
  useEffect(() => {
    if (!eventSource) return;

    const handleBooksUpdated = async (event: MessageEvent) => {
      const data = JSON.parse(event.data);

      if (data.type === "book-updated") {
        console.log("[SSE] Book updated, data:", data);
        
        // Determine which book was updated
        // The event might contain bookName or we use currentBook as fallback
        const updatedBookName = data.bookName || currentBook;
        
        if (!updatedBookName) {
          console.warn("[SSE] Book updated but no book name available");
          return;
        }
        
        console.log(`[SSE] Refetching data for book: ${updatedBookName}`);
        
        try {
          const bookData = await fetchBookData(updatedBookName);
          
          // Only update the stores if this is the current book
          if (updatedBookName === currentBook) {
            setMetadata(bookData.metadata);
            setChapters(bookData.chapters);
            setCharacters(transformApiCharacters(bookData.characters));
            console.log("45: bookData.variants:", bookData.variants);
            setVariants(bookData.allVariants);
            
            // Use currentFile instead of getCurrentChapterFromUrl()
            if (currentFile && bookData.chapters[currentFile]) {
              setCurrentChapterContent(bookData.chapters[currentFile]);
            }
          }
          
          // Always refresh the books list in case book metadata changed
          await loadBooks();
          
        } catch (error) {
          console.error(`[Error - Get-Book-Data for ${updatedBookName}]`, error);
        }
      }
    };

    eventSource.addEventListener("message", handleBooksUpdated);

    return () => {
      eventSource.removeEventListener("message", handleBooksUpdated);
    };
  }, [eventSource, currentBook, currentFile, setVariants, setMetadata, setChapters, setCharacters, setCurrentChapterContent, loadBooks]);

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

  // Render different views based on current route
  if (currentView === 'changes') {
    return <ChangesView />;
  }

  return (
    <div className="app-container">
      <Sidebar />
      <BookEditor />
      <VariantSidebar />
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
