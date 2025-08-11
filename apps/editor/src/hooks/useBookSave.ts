import { useCallback } from 'react';
import { useBooksStore } from '../stores/booksStore';
import { getCurrentChapterFromUrl } from '../utils/getCurrentChapterFromUrl';

export const useBookSave = () => {
  const { 
    currentBook, 
    currentFile, 
    currentChapterContent, 
    setMetadata, 
    setChapters, 
    setCurrentChapterContent 
  } = useBooksStore();

  const handleSave = useCallback(async () => {
    try {
      // Update chapter content
      const updateResponse = await fetch('http://localhost:3000/api/books/update-chapter', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookName: currentBook,
          chapterFile: currentFile,
          content: currentChapterContent
        })
      });

      if (!updateResponse.ok) {
        throw new Error(`Failed to update chapter: ${updateResponse.status} ${updateResponse.statusText}`);
      }

      const bookDataResponse = await fetch(`http://localhost:3000/api/books/get-book-data/${currentBook}`);

      if (!bookDataResponse.ok) {
        throw new Error(`Failed to fetch book data: ${bookDataResponse.status} ${bookDataResponse.statusText}`);
      }

      const data = await bookDataResponse.json();

      setMetadata(data.metadata);
      setChapters(data.chapters);
      setCurrentChapterContent(data.chapters[getCurrentChapterFromUrl()]);

    } catch (error) {
      console.error('Error saving chapter:', error);
    }
  }, [currentBook, currentFile, currentChapterContent, setMetadata, setChapters, setCurrentChapterContent]);

  return { handleSave };
};