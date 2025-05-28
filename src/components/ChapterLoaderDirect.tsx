// src/components/ChapterLoaderDirect.tsx (adjust path as needed)
import React, { useEffect, useState, ReactNode } from 'react';

interface ChapterLoaderDirectProps {
  bookSlug: string;
  chapterId: number;
  // Optional: Pass a more specific skeleton or loading UI
  loadingFallback?: ReactNode;
  errorFallback?: (error: string) => ReactNode;
}

const DefaultLoadingFallback: React.FC<{ chapterId: number }> = ({ chapterId }) => (
  <section data-chapter={chapterId} className="chapter-loading-placeholder">
    <div>Loading Chapter {chapterId}...</div>
    {/* You can reuse your ChapterSkeleton structure here if desired */}
    <div style={{ height: '50px', background: '#eee', margin: '10px 0' }} />
    <div style={{ height: '100px', background: '#eee', margin: '10px 0' }} />
  </section>
);

const DefaultErrorFallback: React.FC<{ chapterId: number; error: string }> = ({ chapterId, error }) => (
  <section data-chapter={chapterId} className="chapter-error-placeholder">
    <div>Error loading Chapter {chapterId}: {error}</div>
  </section>
);

const ChapterLoaderDirect: React.FC<ChapterLoaderDirectProps> = ({
                                                                   bookSlug,
                                                                   chapterId,
                                                                   loadingFallback,
                                                                   errorFallback,
                                                                 }) => {
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
        // Assuming chapter files are like: src/data/books/book-slug/chapters/Chapter1.tsx
        const module = await import(`../data/books/${bookSlug}/chapters/Chapter${chapterId}.tsx`); // Adjust this path!

        if (!isMounted) return;

        if (module.default && typeof module.default === 'function') {
          setChapterComponent(() => module.default); // Store the component type
        } else {
          // Fallback for named exports like `export const Chapter1 = ...`
          const expectedComponentName = `Chapter${chapterId}`;
          if (module[expectedComponentName] && typeof module[expectedComponentName] === 'function') {
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

  if (isLoading) {
    return loadingFallback ? <>{loadingFallback}</> : <DefaultLoadingFallback chapterId={chapterId} />;
  }

  if (error) {
    return errorFallback ? <>{errorFallback(error)}</> : <DefaultErrorFallback chapterId={chapterId} error={error} />;
  }

  if (ChapterComponent) {
    return <ChapterComponent />;
  }

  // Should ideally not be reached if loading/error/component states are handled
  return (
    <section data-chapter={chapterId} className="chapter-unavailable-placeholder">
      <div>Chapter {chapterId} is unavailable.</div>
    </section>
  );
};

// Memoize ChapterLoaderDirect to prevent re-renders if its props (bookSlug, chapterId) haven't changed,
// which is important if BookChapterRenderer re-renders but the chapterId for a specific slot is the same.
export default React.memo(ChapterLoaderDirect);