import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useRouteTransition } from "@platform/providers/RouteTransitionProvider";
import { isRunningOnLocalhost } from "@platform/utils/isRunningOnLocalhost";
import { books } from "@platform/books";
import BookCard from "./BookCard";

interface BookCollectionProps {
  searchQuery?: string;
}

const BookCollection = ({ searchQuery = "" }: BookCollectionProps) => {
  const navigate = useNavigate();
  const { startTransition, setNavigatedFromPlatform } = useRouteTransition();

  const filteredBooks = useMemo(() => {
    const availableBooks = typeof window !== "undefined" && (window.location.hostname.endsWith(".pl") || isRunningOnLocalhost()) ? books : books.filter((b) => b.language !== "pl");
    if (!searchQuery.trim()) return availableBooks;

    const query = searchQuery.toLowerCase();
    return availableBooks.filter(
      (book) =>
        book.title.toLowerCase().includes(query) ||
        book.author.toLowerCase().includes(query) ||
        book.genre.toLowerCase().includes(query) ||
        book.description.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  const handleBookClick = (book: (typeof books)[0]) => {
    const title = book?.title ?? "BookGenius";
    const phrases = book?.phrases;
    const author = book?.author;

    // Indicate user came from platform for proper loader behavior
    setNavigatedFromPlatform(true);
    // Start the transition overlay with book-specific meta
    startTransition({ title, phrases, author, showStartButton: false, onStartClick: undefined });

    // Let the overlay paint before route switch for a smooth fade
    requestAnimationFrame(() => {
      navigate(`/reader?book=${book.slug}`, { state: { meta: { title, phrases, author } } });
    });
  };

  return (
    <section id="book-collection" className="py-16 px-0 md:px-8 m-auto max-w-[400px] sm:max-w-[1400px] min-h-[80vh] flex items-center justify-center">
      <div className="container mx-auto px-0">
        <div className="text-center mb-12 px-4 md:px-0">
          <h2 className="text-4xl font-bold text-foreground mb-4">
            {searchQuery ? (
              <>
                Search <span className="text-library-gold">Results</span>
              </>
            ) : (
              <>
                Our <span className="text-library-gold">Collection</span>
              </>
            )}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {searchQuery
              ? `Showing results for "${searchQuery}"`
              : "Each visual novel is a complete production featuring professional voice acting, animated scenes, and immersive soundtracks that bring literature to life."}
          </p>
        </div>

        {filteredBooks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xl text-muted-foreground">No books found matching "{searchQuery}"</p>
            <p className="text-sm text-muted-foreground mt-2">Try searching for a different title, author, or genre</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 px-4 md:px-0">
            {filteredBooks.map((book) => (
              <BookCard key={book.id} book={book} variant="default" showLanguageFlag onClick={handleBookClick} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default BookCollection;
