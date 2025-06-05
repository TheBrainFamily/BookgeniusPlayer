// src/components/ChapterLoaderDirect.tsx (adjust path as needed)
import React, { useEffect, useState, ReactNode } from "react";

interface ChapterLoaderDirectProps {
  bookSlug: string;
  chapterId: number;
  // Optional: Pass a more specific skeleton or loading UI
  loadingFallback?: ReactNode;
  errorFallback?: (error: string) => ReactNode;
  /** Fired once the Chapter component has appeared in the DOM */
  onChapterRendered?: () => void;
  /** Target paragraph to scroll to when this chapter is the current chapter */
  targetParagraph?: number;
}

const DefaultLoadingFallback: React.FC<{ chapterId: number; bookSlug?: string }> = ({ chapterId, bookSlug }) => (
  <section data-chapter={chapterId} data-book-slug={bookSlug} className="chapter-loading-placeholder px-3">
    <div>Loading Chapter {chapterId}...</div>
    {/* You can reuse your ChapterSkeleton structure here if desired */}
    <div style={{ height: "50px", background: "#eee", margin: "10px 0" }} />
    <div style={{ height: "100px", background: "#eee", margin: "10px 0" }} />
  </section>
);

const DefaultErrorFallback: React.FC<{ chapterId: number; error: string; bookSlug?: string }> = ({ chapterId, error, bookSlug }) => (
  <section data-chapter={chapterId} data-book-slug={bookSlug} className="chapter-error-placeholder">
    <div>
      Error loading Chapter {chapterId}: {error}
    </div>
  </section>
);

const ChapterLoaderDirect: React.FC<ChapterLoaderDirectProps> = ({ bookSlug, chapterId, loadingFallback, errorFallback, onChapterRendered, targetParagraph }) => {
  const [ChapterComponent, setChapterComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Reset state when key props change, to allow reloading if necessary
    setChapterComponent(null);
    setError(null);
    setIsLoading(true);

    let isMounted = true; // To prevent state updates on unmounted component

    const loadChapter = async () => {
      try {
        console.log(`ChapterLoaderDirect: Importing for slug '${bookSlug}', chapter '${chapterId}'`);
        // IMPORTANT: Adjust the path according to your project structure and how Vite handles dynamic imports.
        // Using an alias like '@/' for src might be more robust if your bundler is configured for it.
        const module = await import(`../data/books/${bookSlug}/chapters/Chapter${chapterId}.tsx`);

        if (!isMounted) return;

        if (module.default && typeof module.default === "function") {
          setChapterComponent(() => module.default); // Store the component type
        } else {
          // Fallback for named exports like `export const Chapter1 = ...`
          const expectedComponentName = `Chapter${chapterId}`;
          if (module[expectedComponentName] && typeof module[expectedComponentName] === "function") {
            setChapterComponent(() => module[expectedComponentName]);
          } else {
            console.error(`Chapter ${chapterId} module for slug ${bookSlug} does not have a 'default' or '${expectedComponentName}' export.`);
            setError(`Chapter ${chapterId} content format is invalid.`);
          }
        }
      } catch (err) {
        console.error(`Failed to load Chapter ${chapterId} for slug ${bookSlug}:`, err);
        if (isMounted) {
          setError(`Failed to load chapter ${chapterId}. Check console for details.`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    if (bookSlug && chapterId > 0) {
      loadChapter();
    } else {
      setError("Invalid book slug or chapter ID provided to ChapterLoaderDirect.");
      setIsLoading(false);
    }

    return () => {
      isMounted = false; // Cleanup to prevent setting state on unmounted component
    };
  }, [bookSlug, chapterId]); // Re-run effect if bookSlug or chapterId changes

  useEffect(() => {
    if (!isLoading && ChapterComponent && onChapterRendered) {
      onChapterRendered();
    }
  }, [isLoading, ChapterComponent, onChapterRendered]);

  // Scroll to target paragraph after chapter renders
  useEffect(() => {
    if (!isLoading && ChapterComponent && targetParagraph !== undefined) {
      console.log(`ChapterLoaderDirect: Attempting to scroll to chapter ${chapterId}, paragraph ${targetParagraph}`);

      let intervalId: NodeJS.Timeout | null = null;

      // Function to wait for element and scroll
      const waitAndScroll = () => {
        // For paragraph 0, scroll to the chapter itself
        const selector = targetParagraph === 0 ? `section[data-chapter="${chapterId}"]` : `section[data-chapter="${chapterId}"] [data-index="${targetParagraph}"]`;

        let attempts = 0;
        const maxAttempts = 50; // 5 seconds total

        const checkAndScroll = () => {
          const element = document.querySelector(selector);
          if (element) {
            console.log(`ChapterLoaderDirect: Found ${targetParagraph === 0 ? "chapter" : "paragraph"} element, scrolling to it`);
            // Use requestAnimationFrame to ensure layout is complete
            requestAnimationFrame(() => {
              console.log("GOZDECKI MAY 29 scrollIntoView", element);
              element.scrollIntoView({ behavior: "instant", block: "start" });
            });
            return true;
          }
          return false;
        };

        // Try immediately first
        if (checkAndScroll()) return;

        // Then set up interval to keep checking
        intervalId = setInterval(() => {
          attempts++;
          if (checkAndScroll() || attempts >= maxAttempts) {
            if (intervalId) clearInterval(intervalId);
            if (attempts >= maxAttempts) {
              console.error(
                `ChapterLoaderDirect: Failed to find ${targetParagraph === 0 ? "chapter" : `paragraph ${targetParagraph}`} in chapter ${chapterId} after ${maxAttempts} attempts`,
              );
            }
          }
        }, 100);
      };

      // Start the wait and scroll process
      waitAndScroll();

      return () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }
  }, [isLoading, ChapterComponent, targetParagraph, chapterId]);

  if (isLoading) {
    return loadingFallback ? <>{loadingFallback}</> : <DefaultLoadingFallback chapterId={chapterId} bookSlug={bookSlug} />;
  }

  if (error) {
    return errorFallback ? <>{errorFallback(error)}</> : <DefaultErrorFallback chapterId={chapterId} error={error} bookSlug={bookSlug} />;
  }

  if (ChapterComponent) {
    // Wrap the component to ensure it has the necessary data attributes
    return (
      <div data-chapter-wrapper={chapterId} data-book-slug={bookSlug}>
        <ChapterComponent />
      </div>
    );
  }

  // Should ideally not be reached if loading/error/component states are handled
  return (
    <section data-chapter={chapterId} data-book-slug={bookSlug} className="chapter-unavailable-placeholder">
      <div>Chapter {chapterId} is unavailable.</div>
    </section>
  );
};

// Memoize ChapterLoaderDirect to prevent re-renders if its props (bookSlug, chapterId) haven't changed,
// which is important if BookChapterRenderer re-renders but the chapterId for a specific slot is the same.
export default React.memo(ChapterLoaderDirect);
