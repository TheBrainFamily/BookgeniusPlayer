// BookChapterRenderer.tsx
import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { BookData } from "./booksData/types"; // Adjust path
import { useLocation } from "./state/LocationContext"; // Adjust path
import { useModal } from "./context/ModalContext"; // Import useModal
import { usePageObserver } from "@/hooks/usePageObserver";
import ChapterLoaderDirect from "@/components/ChapterLoaderDirect";

interface BookChapterRendererProps {
  bookData: BookData;
}

const BookChapterRendererComponent: React.FC<BookChapterRendererProps> = ({ bookData }) => {
  const [containerElement, setContainerElement] = useState<HTMLElement | null>(null);
  const { location, lastSystemLocation } = useLocation();
  const { openCharacterDetailsModal } = useModal(); // Destructure the stable function

  const { observeNewParagraphs, cleanupRemovedParagraphs } = usePageObserver({ enabled: !!containerElement && !!bookData?.slug, openCharacterDetailsModal });

  useEffect(() => {
    const container = document.getElementById("content-container");
    setContainerElement(container || null);
    if (!container) console.warn("#content-container not found for BookChapterRenderer");
  }, []);

  const chaptersToRender = useMemo(() => {
    if (!bookData || typeof bookData.chapters !== "number") return [];
    const { chapters } = bookData;
    let currentChapterNum = Number(location.currentChapter);
    if (isNaN(currentChapterNum) || currentChapterNum <= 0) currentChapterNum = 1;
    return [currentChapterNum - 1, currentChapterNum, currentChapterNum + 1].filter((id) => id > 0 && id <= chapters);
  }, [bookData?.chapters, location.currentChapter]);

  // Determine if we should scroll to a specific paragraph
  const shouldScrollToChapter = useMemo(() => {
    if (!lastSystemLocation) return null;

    // Only scroll if this is a recent system navigation (within last 2 seconds)
    const isRecent = Date.now() - lastSystemLocation.timestamp < 2000;
    if (!isRecent) return null;

    // Only scroll if the system location matches current location
    if (lastSystemLocation.location.currentChapter === location.currentChapter && lastSystemLocation.location.currentParagraph === location.currentParagraph) {
      console.log(
        `BookChapterRenderer: System navigation detected to chapter ${lastSystemLocation.location.currentChapter}, paragraph ${lastSystemLocation.location.currentParagraph}`,
      );
      return { chapter: lastSystemLocation.location.currentChapter, paragraph: lastSystemLocation.location.currentParagraph };
    }

    return null;
  }, [lastSystemLocation, location.currentChapter, location.currentParagraph]);

  // Whenever we change which chapters are rendered, update the observer lists
  useEffect(() => {
    if (!bookData) return;
    observeNewParagraphs();
    cleanupRemovedParagraphs();
  }, [chaptersToRender, observeNewParagraphs, cleanupRemovedParagraphs, bookData]);

  if (!containerElement) {
    return null;
  }

  if (!bookData || !bookData.slug || typeof bookData.chapters !== "number") {
    return createPortal(
      <section>
        <div className="book-loading">BookChapterRenderer: Waiting for complete book data...</div>
      </section>,
      containerElement,
    );
  }

  console.log(`BookChapterRenderer: Rendering chapters ${chaptersToRender.join(", ")} (for location.currentChapter: ${location.currentChapter})`);
  if (shouldScrollToChapter) {
    console.log(`BookChapterRenderer: Will scroll to chapter ${shouldScrollToChapter.chapter}, paragraph ${shouldScrollToChapter.paragraph}`);
  }

  return createPortal(
    <section>
      {chaptersToRender.map((chapterId) => (
        <ChapterLoaderDirect
          key={`chapter-${bookData.slug}-${chapterId}`}
          bookSlug={bookData.slug}
          chapterId={chapterId}
          targetParagraph={shouldScrollToChapter && chapterId === shouldScrollToChapter.chapter ? shouldScrollToChapter.paragraph : undefined}
          onChapterRendered={() => {
            observeNewParagraphs();
            cleanupRemovedParagraphs();
          }}
        />
      ))}
      <div style={{ height: "50vh" }} /> {/* Spacer */}
    </section>,
    containerElement,
  );
};

export const BookChapterRenderer = React.memo(BookChapterRendererComponent);
