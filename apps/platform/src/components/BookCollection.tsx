import { Card, CardContent, CardHeader, CardTitle } from "@platform/components/ui/card";
import { Button } from "@platform/components/ui/button";
import { Badge } from "@platform/components/ui/badge";
import { Star, Clock, Play, Volume2 } from "lucide-react";
import { books } from "@platform/books";
import { useNavigate } from "react-router-dom";
import { useRouteTransition } from "@platform/providers/RouteTransitionProvider";
import { useMemo } from "react";

interface BookCollectionProps {
  searchQuery?: string;
}

const BookCollection = ({ searchQuery = "" }: BookCollectionProps) => {
  const navigate = useNavigate();
  const { startTransition, setNavigatedFromPlatform } = useRouteTransition();

  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return books;

    const query = searchQuery.toLowerCase();
    return books.filter(
      (book) =>
        book.title.toLowerCase().includes(query) ||
        book.author.toLowerCase().includes(query) ||
        book.genre.toLowerCase().includes(query) ||
        book.description.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  const handleBookClick = (slug: string) => {
    const book = books.find((b) => b.slug === slug);
    const title = book?.title ?? "BookGenius";
    const phrases = book?.phrases;
    const author = book?.author;

    // Indicate user came from platform for proper loader behavior
    setNavigatedFromPlatform(true);
    // Start the transition overlay with book-specific meta
    startTransition({ title: title ?? "BookGenius", phrases, author, showStartButton: false, onStartClick: undefined });

    // Let the overlay paint before route switch for a smooth fade
    requestAnimationFrame(() => {
      navigate(`/reader?book=${slug}`, { state: { meta: { title, phrases, author } } });
    });
  };

  return (
    <section className="py-16 px-4 min-h-[90vh]" id="book-collection">
      <div className="container mx-auto">
        <div className="text-center mb-12">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredBooks.map((book) => (
              <Card
                key={book.id}
                className="bg-card/50 backdrop-blur-sm border-library-walnut hover:border-library-gold transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-library-gold/10 group cursor-pointer flex flex-col"
                onClick={() => handleBookClick(book.slug)}
              >
                <CardHeader className="pb-4">
                  {/* Book Cover */}
                  <div className="w-full h-48 rounded-lg mb-4 relative overflow-hidden group-hover:animate-bookglow">
                    <video className="w-full h-full object-cover" autoPlay loop muted playsInline poster={book.poster}>
                      <source src={book.video} type="video/mp4" />
                    </video>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Play className="h-12 w-12 text-white/80 opacity-60 drop-shadow-lg" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                    <Badge className="absolute top-2 right-2 bg-library-gold/90 text-library-mahogany">{book.genre}</Badge>
                    <div className="absolute bottom-2 left-2 flex items-center space-x-1">
                      <Volume2 className="h-3 w-3 text-white/80" />
                      <span className="text-xs text-white/80">Audio</span>
                    </div>
                    {book.language === "pl" && (
                      <div className="absolute bottom-2 right-2">
                        <svg width="24" height="16" viewBox="0 0 24 16" className="shadow-md" aria-label="Polish language">
                          <rect width="24" height="8" fill="#ffffff" />
                          <rect y="8" width="24" height="8" fill="#dc143c" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <CardTitle className="text-lg font-bold text-foreground group-hover:text-library-gold transition-colors line-clamp-2">{book.title}</CardTitle>
                  <p className="text-library-gold font-medium">{book.author}</p>
                </CardHeader>

                <CardContent className="flex flex-col flex-1">
                  <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 mb-4">{book.description}</p>

                  <div className="mt-auto space-y-4">
                    <div className="flex flex-wrap gap-1">
                      {book.features.slice(0, 2).map((feature, index) => (
                        <Badge key={index} variant="outline" className="text-xs border-library-walnut text-muted-foreground">
                          {feature}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 text-library-gold fill-current" />
                        <span className="text-foreground font-medium">{book.rating}</span>
                      </div>
                      <div className="flex items-center space-x-1 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{book.readTime}</span>
                      </div>
                      <span className="text-muted-foreground">{book.year}</span>
                    </div>
                    <Button
                      className="w-full bg-library-walnut group-hover:bg-library-gold group-hover:text-library-mahogany hover:bg-library-gold hover:text-library-mahogany transition-all duration-300 group/btn"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBookClick(book.slug);
                      }}
                    >
                      <Play className="mr-2 h-4 w-4 group-hover:scale-110 group-hover/btn:scale-110 transition-transform" />
                      Experience Novel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default BookCollection;
