// BookChapterRenderer.tsx - Updated
import React, { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { BookData } from "./booksData/types"; // Adjust path
import { useLocation } from "./state/LocationContext";
import ChapterLoaderDirect from "@/components/ChapterLoaderDirect"; // Adjust path

interface BookChapterRendererProps {
  bookData: BookData; // Expects bookData.slug and bookData.totalChapters
}

const BookChapterRendererComponent: React.FC<BookChapterRendererProps> = ({ bookData }) => {
  const [containerElement, setContainerElement] = useState<HTMLElement | null>(null);
  const { location } = useLocation();

  // --- Diagnostic for bookData prop (keep for stability checks) ---
  const prevBookDataRef = useRef<BookData | null>(null);
  useEffect(() => {
    // console.log("BookChapterRenderer DIAGNOSTIC: bookData current value:", JSON.stringify(bookData)?.substring(0,100));
    if (prevBookDataRef.current && prevBookDataRef.current !== bookData) {
      console.warn("BookChapterRenderer DIAGNOSTIC: bookData prop has CHANGED REFERENCE.");
    } else if (!prevBookDataRef.current && bookData) {
      console.log("BookChapterRenderer DIAGNOSTIC: bookData prop initialized.");
    } else if (!bookData && prevBookDataRef.current) {
      console.warn("BookChapterRenderer DIAGNOSTIC: bookData prop BECAME NULL.");
    }
    prevBookDataRef.current = bookData;
  }, [bookData]);
  // --- End Diagnostic ---

  useEffect(() => {
    const container = document.getElementById("content-container");
    setContainerElement(container || null);
    if (!container) console.warn("#content-container not found");
  }, []);

  const chaptersToRender = useMemo(() => {
    // Ensure bookData and totalChapters are valid before proceeding
    if (!bookData || typeof bookData.chapters !== 'number') {
      console.warn("BookChapterRenderer: bookData or chapters missing for chaptersToRender.");
      return [];
    }
    const { chapters } = bookData;
    let currentChapterNum = Number(location.currentChapter);

    if (isNaN(currentChapterNum) || currentChapterNum <= 0) {
      currentChapterNum = 1; // Default to chapter 1 if current location is invalid
    }

    return [currentChapterNum - 1, currentChapterNum, currentChapterNum + 1]
      .filter((id) => id > 0 && id <= chapters);
  }, [bookData?.chapters, location.currentChapter]);

  if (!containerElement) {
    return null;
  }

  // If bookData itself is not ready (e.g. slug or chapters missing)
  if (!bookData || !bookData.slug || typeof bookData.chapters !== 'number') {
    return createPortal(
      <section><div className="book-loading">Waiting for book data...</div></section>,
      containerElement
    );
  }

  console.log(`BookChapterRenderer: Rendering chapters using ChapterLoaderDirect: ${chaptersToRender.join(', ')} (for location.currentChapter: ${location.currentChapter})`);

  return createPortal(
    <section>
      {chaptersToRender.map((chapterId) => (
        <ChapterLoaderDirect
          key={`chapter-${bookData.slug}-${chapterId}`} // More specific key
          bookSlug={bookData.slug}
          chapterId={chapterId}
        />
      ))}
      <div style={{ height: "50vh" }} /> {/* Spacer */}
    </section>,
    containerElement
  );
};

export const BookChapterRenderer = React.memo(BookChapterRendererComponent);