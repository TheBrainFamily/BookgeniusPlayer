import { useCallback } from "react";
import { useChangesStore } from "../stores/changesStore";
import { useBooksStore } from "../stores/booksStore";
import { fetchBookData } from "../api/bookApi";
import { transformApiCharacters } from "../utils/characterTransform";

export const useSaveAllChanges = () => {
  const { getAllChanges, clearAllChanges } = useChangesStore();
  const { setMetadata, setChapters, setCharacters, setVariants } = useBooksStore();

  const saveAllChanges = useCallback(async () => {
    const allChanges = getAllChanges();
    const errors: string[] = [];
    const successes: string[] = [];

    // Process each change
    for (const change of allChanges) {
      try {
        if (change.type === "chapter") {
          // Save chapter change
          const response = await fetch("http://localhost:3000/api/books/update-chapter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookName: change.bookName, chapterFile: change.filePath, content: change.currentContent }),
          });

          if (!response.ok) {
            throw new Error(`Failed to update chapter ${change.filePath}: ${response.status} ${response.statusText}`);
          }

          successes.push(`Updated chapter: ${change.bookTitle} - ${change.filePath}`);
        } else if (change.type === "variant") {
          // Extract variant ID from filepath (e.g., "variants/ch1-p1-s1" -> "ch1-p1-s1")
          const variantId = change.filePath.replace("variants/", "");

          console.log("38: change.currentContent BANG!", change.currentContent);

          // Save variant change
          const response = await fetch("http://localhost:3000/api/books/update-variants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookName: change.bookName, variant: change.currentContent }),
          });

          if (!response.ok) {
            throw new Error(`Failed to update variant ${change.filePath}: ${response.status} ${response.statusText}`);
          }

          successes.push(`Updated variant: ${change.bookTitle} - ${variantId}`);
        }
      } catch (error) {
        console.error("Error saving change:", error);
        errors.push(`${change.filePath}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    // If all changes saved successfully, clear them and reload affected books
    if (errors.length === 0) {
      clearAllChanges();

      // Get unique book names that were updated
      const updatedBooks = new Set(allChanges.map((change) => change.bookName));

      // Reload data for each updated book
      for (const bookName of updatedBooks) {
        try {
          const bookData = await fetchBookData(bookName);
          setMetadata(bookData.metadata);
          setChapters(bookData.chapters);
          setCharacters(transformApiCharacters(bookData.characters));
          setVariants(bookData.allVariants);
        } catch (error) {
          console.error(`Error reloading book data for ${bookName}:`, error);
        }
      }
    }

    return { successes, errors };
  }, [getAllChanges, clearAllChanges, setMetadata, setChapters, setCharacters, setVariants]);

  return { saveAllChanges };
};
