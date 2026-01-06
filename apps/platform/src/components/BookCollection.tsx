import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useRouteTransition } from "@platform/providers/RouteTransitionProvider";
import { getBooksByCurrentLanguage } from "@platform/utils/bookLanguageFilter";
import { books } from "@platform/books";
import BookCard from "./BookCard";
import { detectLanguageFromDomain } from "@platform/utils/languageDetection.ts";

interface BookCollectionProps {
  searchQuery?: string;
}

const BookCollection = ({ searchQuery = "" }: BookCollectionProps) => {
  const navigate = useNavigate();
  const { startTransition, setNavigatedFromPlatform } = useRouteTransition();
  const { t } = useTranslation();
  const language = useMemo(() => detectLanguageFromDomain(), []);

  const filteredBooks = useMemo(() => {
    const availableBooks = getBooksByCurrentLanguage(books);
    if (!searchQuery.trim()) return availableBooks;

    const query = searchQuery.toLowerCase();
    return availableBooks.filter(
      (book) =>
        book.title.toLowerCase().includes(query) ||
        book.author.toLowerCase().includes(query) ||
        book.metadata[language].genre.toLowerCase().includes(query) ||
        book.metadata[language].description.toLowerCase().includes(query),
    );
  }, [searchQuery, language]);

  const originalOrder = useMemo(() => {
    return new Map(filteredBooks.map((b, i) => [b.id, i]));
  }, [filteredBooks]);

  const handleBookClick = (book: (typeof books)[0]) => {
    const title = book?.title ?? "BookGenius";
    const phrases = book?.metadata[language].phrases;
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
    <section
      id="book-collection"
      className="py-16 px-0 md:px-8 m-auto max-w-[400px] sm:max-w-[1400px] min-h-[80vh] flex items-center justify-center"
    >
      <div className="container mx-auto px-0">
        <div className="text-center mb-12 px-4 md:px-0">
          <h2 className="text-4xl font-bold text-foreground mb-4">
            {searchQuery ? (
              <>
                {t("collection.searchResults").split(" ")[0]}{" "}
                <span className="text-library-gold">
                  {t("collection.searchResults").split(" ")[1]}
                </span>
              </>
            ) : (
              <>
                {t("collection.ourCollection").split(" ")[0]}{" "}
                <span className="text-library-gold">
                  {t("collection.ourCollection").split(" ")[1]}
                </span>
              </>
            )}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {searchQuery
              ? `${t("collection.searchResultsFor")} "${searchQuery}"`
              : t("collection.description")}
          </p>
        </div>

        {filteredBooks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xl text-muted-foreground">
              {t("collection.noResults")} "{searchQuery}"
            </p>
            <p className="text-sm text-muted-foreground mt-2">{t("collection.noResultsHint")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 px-4 md:px-0">
            {filteredBooks
              .map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  variant="default"
                  showLanguageFlag
                  onClick={handleBookClick}
                />
              ))
              .sort((a, b) => {
                const aPref = a.props.book.language === language ? 0 : 1;
                const bPref = b.props.book.language === language ? 0 : 1;
                if (aPref !== bPref) return aPref - bPref;
                // Keep original order when preference is the same
                const aIdx = originalOrder.get(a.props.book.id) ?? 0;
                const bIdx = originalOrder.get(b.props.book.id) ?? 0;
                return aIdx - bIdx;
              })}
          </div>
        )}
      </div>
    </section>
  );
};

export default BookCollection;
