import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useRouteTransition } from "@platform/providers/RouteTransitionProvider";
import { SPLASH_FADE_DURATION_MS } from "../../../player/src/components/SplashScreen";
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
    let availableBooks = getBooksByCurrentLanguage(books);

    // Hide Polish 1984 - it's already in featured section
    if (language === "pl") {
      availableBooks = availableBooks.filter((book) => book.slug !== "1984");
    }

    if (!searchQuery.trim()) return availableBooks;

    const query = searchQuery.toLowerCase();
    return availableBooks.filter(
      (book) =>
        book.title.toLowerCase().includes(query) ||
        book.author.toLowerCase().includes(query) ||
        book.metadata[language]?.genre.toLowerCase().includes(query) ||
        book.metadata[language]?.description.toLowerCase().includes(query),
    );
  }, [searchQuery, language]);

  const originalOrder = useMemo(() => {
    return new Map(filteredBooks.map((b, i) => [b.id, i]));
  }, [filteredBooks]);

  const handleBookClick = (
    book: (typeof books)[0],
    clickData: {
      rect: { x: number; y: number; width: number; height: number };
      capturedFrame: string | null;
    },
  ) => {
    const title = book.title ?? "BookGenius";
    const phrases = book.metadata[language]?.phrases ?? [];
    const author = book.author;

    // Indicate user came from platform for proper loader behavior
    setNavigatedFromPlatform(true);
    // Start the transition overlay with book-specific meta and card rect for expansion animation
    startTransition({
      title,
      phrases,
      author,
      showStartButton: false,
      onStartClick: undefined,
      cardRect: clickData.rect,
      video: book.video,
      capturedFrame: clickData.capturedFrame,
    });

    // Wait for overlay to fade in before navigating (prevents flash when route unmounts)
    setTimeout(() => {
      navigate(`/reader?book=${book.slug}`, { state: { meta: { title, phrases, author } } });
    }, SPLASH_FADE_DURATION_MS);
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
            {[...filteredBooks]
              .sort((a, b) => {
                const aPref = a.language === language ? 0 : 1;
                const bPref = b.language === language ? 0 : 1;
                if (aPref !== bPref) return aPref - bPref;
                // Keep original order when preference is the same
                const aIdx = originalOrder.get(a.id) ?? 0;
                const bIdx = originalOrder.get(b.id) ?? 0;
                return aIdx - bIdx;
              })
              .map((book) => (
                <div
                  key={book.id}
                  // Hide English 1984 at xl (4 columns) to avoid 4+4+1 layout
                  className={
                    book.slug === "1984-English" && language === "en" ? "xl:hidden" : undefined
                  }
                >
                  <BookCard
                    book={book}
                    variant="default"
                    showLanguageFlag
                    onClick={handleBookClick}
                  />
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default BookCollection;
