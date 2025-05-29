// BookChapterRenderer.tsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { BookData } from "./booksData/types"; // Adjust path
import { useLocation } from "./state/LocationContext"; // Adjust path
import { useModal } from "./context/ModalContext"; // Import useModal
import { setupPageObserver } from "./ui/pageObserver";
import ChapterLoaderDirect from "@/components/ChapterLoaderDirect"; // Import setupPageObserver (adjust path)

interface BookChapterRendererProps {
  bookData: BookData;
}

const BookChapterRendererComponent: React.FC<BookChapterRendererProps> = ({ bookData }) => {
  const [containerElement, setContainerElement] = useState<HTMLElement | null>(null);
  const { location } = useLocation();
  const { openCharacterDetailsModal } = useModal(); // Destructure the stable function

  const pageObserverRef = useRef<{ observer: IntersectionObserver; observeNewParagraphs: () => number; cleanupRemovedParagraphs: () => number } | null>(null);
  const chapterMutationObserverRef = useRef<MutationObserver | null>(null);

  // --- Diagnostic for bookData prop (keep if useful) ---
  const prevBookDataRef = useRef<BookData | null>(null);
  useEffect(() => {
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
    if (!container) console.warn("#content-container not found for BookChapterRenderer");
  }, []);

  const chaptersToRender = useMemo(() => {
    if (!bookData || typeof bookData.chapters !== "number") return [];
    const { chapters } = bookData;
    let currentChapterNum = Number(location.currentChapter);
    if (isNaN(currentChapterNum) || currentChapterNum <= 0) currentChapterNum = 1;
    return [currentChapterNum - 1, currentChapterNum, currentChapterNum + 1].filter((id) => id > 0 && id <= chapters);
  }, [bookData?.chapters, location.currentChapter]);

  // Effect to setup/cleanup page observer
  useEffect(() => {
    const cleanupObservers = () => {
      if (pageObserverRef.current) {
        console.log("BookChapterRenderer: Disconnecting Page IntersectionObserver");
        pageObserverRef.current.observer.disconnect();
        pageObserverRef.current = null;
      }
      if (chapterMutationObserverRef.current) {
        console.log("BookChapterRenderer: Disconnecting Chapter MutationObserver");
        chapterMutationObserverRef.current.disconnect();
        chapterMutationObserverRef.current = null;
      }
    };

    // Conditions for not setting up the observer
    if (!containerElement || !bookData || !bookData.slug || chaptersToRender.length === 0 || !openCharacterDetailsModal) {
      console.log("BookChapterRenderer: Conditions not met for observer setup. Cleaning up.");
      cleanupObservers();
      return;
    }

    const setupPageObserverWithMutation = () => {
      // Clean up any stale paragraph references when chapters change
      if (pageObserverRef.current) {
        console.log("BookChapterRenderer: Cleaning up stale paragraph references before new setup.");
        pageObserverRef.current.cleanupRemovedParagraphs();
      }

      // Always disconnect previous observers before setting up new ones
      cleanupObservers();

      console.log("BookChapterRenderer: Setting up Page IntersectionObserver.");
      const observerResult = setupPageObserver(openCharacterDetailsModal);

      if (observerResult) {
        pageObserverRef.current = observerResult;
        console.log("BookChapterRenderer: Page IntersectionObserver setup successful.");

        // Set up MutationObserver to watch for new chapters
        chapterMutationObserverRef.current = new MutationObserver((mutations) => {
          let hasChanges = false;

          // Check if any new chapter sections were added
          const newChaptersAdded = mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => node instanceof Element && node.matches("section[data-chapter]")));

          // Check if any chapter sections were removed
          const chaptersRemoved = mutations.some((mutation) => Array.from(mutation.removedNodes).some((node) => node instanceof Element && node.matches("section[data-chapter]")));

          if (chaptersRemoved && pageObserverRef.current) {
            console.log("BookChapterRenderer: Chapter sections removed. Cleaning up removed paragraphs.");
            const removedCount = pageObserverRef.current.cleanupRemovedParagraphs();
            if (removedCount > 0) {
              console.log(`BookChapterRenderer: Cleaned up ${removedCount} removed paragraph observers.`);
            }
            hasChanges = true;
          }

          if (newChaptersAdded && pageObserverRef.current) {
            console.log("BookChapterRenderer: New chapter sections detected. Observing new paragraphs.");
            // Small delay to ensure DOM is fully updated
            setTimeout(() => {
              const newCount = pageObserverRef.current?.observeNewParagraphs();
              if (newCount && newCount > 0) {
                console.log(`BookChapterRenderer: Added ${newCount} new paragraphs to observer.`);
              }
            }, 100);
            hasChanges = true;
          }

          // If we have any changes, also do a general cleanup
          if (hasChanges) {
            setTimeout(() => {
              pageObserverRef.current?.cleanupRemovedParagraphs();
            }, 200);
          }
        });

        chapterMutationObserverRef.current.observe(containerElement, { childList: true, subtree: true, attributes: false, characterData: false });

        console.log("BookChapterRenderer: Chapter MutationObserver setup successful.");
      } else {
        console.log("BookChapterRenderer: setupPageObserver returned null. Setting up retry MutationObserver.");

        // Set up MutationObserver to wait for initial paragraphs to appear
        chapterMutationObserverRef.current = new MutationObserver((mutations) => {
          // Check if any paragraphs with data-index were added
          const newParagraphsAdded = mutations.some((mutation) =>
            Array.from(mutation.addedNodes).some((node) => node instanceof Element && (node.matches("[data-index]") || node.querySelector("[data-index]"))),
          );

          if (newParagraphsAdded) {
            console.log("BookChapterRenderer: Initial paragraphs detected. Retrying Page IntersectionObserver setup.");
            // Small delay to ensure all paragraphs are rendered
            setTimeout(() => {
              const retryResult = setupPageObserver(openCharacterDetailsModal);
              if (retryResult) {
                // Disconnect the retry observer
                chapterMutationObserverRef.current?.disconnect();

                // Set up the new observer
                pageObserverRef.current = retryResult;
                console.log("BookChapterRenderer: Page IntersectionObserver setup successful on retry.");

                // Now set up the chapter-level MutationObserver for future chapters
                chapterMutationObserverRef.current = new MutationObserver((mutations) => {
                  let hasChanges = false;

                  const newChaptersAdded = mutations.some((mutation) =>
                    Array.from(mutation.addedNodes).some((node) => node instanceof Element && node.matches("section[data-chapter]")),
                  );

                  const chaptersRemoved = mutations.some((mutation) =>
                    Array.from(mutation.removedNodes).some((node) => node instanceof Element && node.matches("section[data-chapter]")),
                  );

                  if (chaptersRemoved && pageObserverRef.current) {
                    console.log("BookChapterRenderer: Chapter sections removed. Cleaning up removed paragraphs.");
                    const removedCount = pageObserverRef.current.cleanupRemovedParagraphs();
                    if (removedCount > 0) {
                      console.log(`BookChapterRenderer: Cleaned up ${removedCount} removed paragraph observers.`);
                    }
                    hasChanges = true;
                  }

                  if (newChaptersAdded && pageObserverRef.current) {
                    console.log("BookChapterRenderer: New chapter sections detected. Observing new paragraphs.");
                    setTimeout(() => {
                      const newCount = pageObserverRef.current?.observeNewParagraphs();
                      if (newCount && newCount > 0) {
                        console.log(`BookChapterRenderer: Added ${newCount} new paragraphs to observer.`);
                      }
                    }, 100);
                    hasChanges = true;
                  }

                  if (hasChanges) {
                    setTimeout(() => {
                      pageObserverRef.current?.cleanupRemovedParagraphs();
                    }, 200);
                  }
                });

                chapterMutationObserverRef.current.observe(containerElement, { childList: true, subtree: true, attributes: false, characterData: false });

                console.log("BookChapterRenderer: Chapter MutationObserver setup successful after retry.");
              }
            }, 100);
          }
        });

        chapterMutationObserverRef.current.observe(containerElement, { childList: true, subtree: true, attributes: false, characterData: false });

        console.log("BookChapterRenderer: Retry MutationObserver setup successful.");
      }
    };

    setupPageObserverWithMutation();

    return () => {
      console.log("BookChapterRenderer: Observer useEffect cleanup.");
      cleanupObservers();
    };
  }, [containerElement, bookData?.slug, location.currentChapter, openCharacterDetailsModal]);

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

  return createPortal(
    <section>
      {chaptersToRender.map((chapterId) => (
        <ChapterLoaderDirect key={`chapter-${bookData.slug}-${chapterId}`} bookSlug={bookData.slug} chapterId={chapterId} />
      ))}
      <div style={{ height: "50vh" }} /> {/* Spacer */}
    </section>,
    containerElement,
  );
};

export const BookChapterRenderer = React.memo(BookChapterRendererComponent);
