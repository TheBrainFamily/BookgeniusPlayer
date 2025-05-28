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

  const pageIntersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const domMutationObserverRef = useRef<MutationObserver | null>(null);

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
      if (pageIntersectionObserverRef.current) {
        console.log("BookChapterRenderer: Disconnecting Page IntersectionObserver");
        pageIntersectionObserverRef.current.disconnect();
        pageIntersectionObserverRef.current = null;
      }
      if (domMutationObserverRef.current) {
        console.log("BookChapterRenderer: Disconnecting DOM MutationObserver");
        domMutationObserverRef.current.disconnect();
        domMutationObserverRef.current = null;
      }
    };

    // Conditions for not setting up the observer
    if (!containerElement || !bookData || !bookData.slug || chaptersToRender.length === 0 || !openCharacterDetailsModal) {
      console.log("BookChapterRenderer: Conditions not met for observer setup. Cleaning up.");
      cleanupObservers();
      return;
    }

    const attemptSetupPageObserver = (): boolean => {
      if (!containerElement) return false;

      // Always disconnect previous IntersectionObserver before setting up a new one
      if (pageIntersectionObserverRef.current) {
        pageIntersectionObserverRef.current.disconnect();
        pageIntersectionObserverRef.current = null;
      }

      // Paragraphs are queried by setupPageObserver itself using the container a
      // ensure it's up-to-date.
      console.log("BookChapterRenderer: Attempting to set up Page IntersectionObserver.");
      const observer = setupPageObserver(openCharacterDetailsModal); // Pass the modal context
      if (observer) {
        pageIntersectionObserverRef.current = observer;
        console.log("BookChapterRenderer: Page IntersectionObserver setup successful.");
        // If IntersectionObserver setup worked, we might not need the MutationObserver anymore
        if (domMutationObserverRef.current) {
          domMutationObserverRef.current.disconnect();
          domMutationObserverRef.current = null;
        }
        return true;
      } else {
        console.warn("BookChapterRenderer: setupPageObserver returned null (e.g., no paragraphs found initially).");
        return false;
      }
    };

    // Try to set up the observer. If it fails (e.g. paragraphs not rendered yet by ChapterLoaderDirect),
    // then set up a MutationObserver.
    if (!attemptSetupPageObserver()) {
      console.log("BookChapterRenderer: Initial Page IntersectionObserver setup failed, setting up DOM MutationObserver.");

      // Ensure no lingering mutation observer
      if (domMutationObserverRef.current) {
        domMutationObserverRef.current.disconnect();
      }

      domMutationObserverRef.current = new MutationObserver((mutations, obs) => {
        // A simple check: has any node with data-index been added?
        const newParagraphsAdded = mutations.some((mutation) =>
          Array.from(mutation.addedNodes).some((node) => node instanceof Element && (node.matches("[data-index]") || node.querySelector("[data-index]"))),
        );

        if (newParagraphsAdded) {
          console.log("BookChapterRenderer: DOM MutationObserver detected new paragraphs. Re-attempting Page IntersectionObserver setup.");
          if (attemptSetupPageObserver()) {
            console.log("BookChapterRenderer: Page IntersectionObserver setup successful via MutationObserver. Disconnecting MutationObserver.");
            obs.disconnect(); // Self-disconnect
            domMutationObserverRef.current = null;
          }
        }
      });

      domMutationObserverRef.current.observe(containerElement, { childList: true, subtree: true });
    }

    return () => {
      console.log("BookChapterRenderer: Observer useEffect cleanup.");
      cleanupObservers();
    };
    // Dependencies:
    // - containerElement: The root for observation.
    // - bookData.slug: If the book changes, the context of observation changes.
    // - location.currentChapter: When this changes, chaptersToRender changes, so the DOM content changes.
    //   This is a good signal to re-initialize the observer for the new set of paragraphs.
    // - modal: The modal context object. If it's stable (properly memoized in ModalProvider), this is fine.
  }, [containerElement, bookData?.slug, location.currentChapter, openCharacterDetailsModal]);
  // chaptersToRender was removed from deps because its reference changes too often.
  // location.currentChapter is a better proxy for when the *set* of rendered chapters changes.

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
