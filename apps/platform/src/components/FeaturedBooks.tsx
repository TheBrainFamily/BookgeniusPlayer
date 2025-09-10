import { useNavigate } from "react-router-dom";

import { useRouteTransition } from "@platform/providers/RouteTransitionProvider";
import { books } from "@platform/books";
import BookCard from "./BookCard";
import { useTranslation } from "react-i18next";
import { featuredBooks } from "@platform/utils/bookLanguageFilter.ts";

const FeaturedBooks = () => {
  const navigate = useNavigate();
  const { startTransition, setNavigatedFromPlatform } = useRouteTransition();
  const { t } = useTranslation();

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
    <section className="py-16 px-4 min-h-[80vh] flex items-center justify-center" id="featured-books">
      <div className="container mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-foreground mb-4">
            {t("featured.featuredMasterpieces").split(" ")[0]} <span className="text-library-gold">{t("featured.featuredMasterpieces").split(" ")[1]}</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t("featured.description")}</p>
        </div>

        <div className="flex flex-row gap-2 sm:gap-4 md:gap-6 lg:gap-8 max-w-4xl mx-auto items-stretch">
          {featuredBooks().map((book) => (
            <div key={book.id} className="flex-1 min-w-0 flex">
              <BookCard book={book} variant="featured" showLanguageFlag onClick={handleBookClick} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedBooks;
