import { useNavigate } from "react-router-dom";
import { Star, Play, Clock, Volume2, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@platform/components/ui/card";
import { useRouteTransition } from "@platform/providers/RouteTransitionProvider";
import { Button } from "@platform/components/ui/button";
import { Badge } from "@platform/components/ui/badge";
import { books } from "@platform/books";
import { humanizeBookCardButtonText } from "@platform/utils/humanizeBookCardButtonText";

const featuredBookSlugs = ["1984-English", "Othello"];
const featuredBooks = books.filter((book) => featuredBookSlugs.includes(book.slug));

const FeaturedBooks = () => {
  const navigate = useNavigate();
  const { startTransition, setNavigatedFromPlatform } = useRouteTransition();

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
            Featured <span className="text-library-gold">Masterpieces</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Experience two legendary works of literature like never before. Each story features cinematic visuals, professional voice acting, and immersive soundscapes that
            transform reading into a complete sensory journey.
          </p>
        </div>

        <div className="flex flex-row gap-2 sm:gap-4 md:gap-6 lg:gap-8 max-w-4xl mx-auto">
          {featuredBooks.map((book) => (
            <Card
              key={book.id}
              className="relative bg-card/50 backdrop-blur-sm border-library-walnut hover:border-library-gold transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-library-gold/10 group cursor-pointer flex flex-col"
              onClick={() => handleBookClick(book)}
            >
              {/* Animated border glow */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute inset-0 bg-gradient-to-r from-library-gold/20 via-transparent to-library-gold/20 animate-pulse" />
              </div>

              {/* Animated background sparkles */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                <div className="absolute top-4 right-4 animate-pulse">
                  <Sparkles className="h-4 w-4 text-library-gold/60" />
                </div>
                <div className="absolute bottom-6 left-6 animate-pulse" style={{ animationDelay: "1s" }}>
                  <Sparkles className="h-3 w-3 text-library-gold/40" />
                </div>
              </div>

              <CardHeader className="pb-3 sm:pb-4 p-2 sm:p-4 md:p-6">
                {/* Book Cover */}
                <div className="w-full h-40 sm:h-40 md:h-48 lg:h-54 rounded-lg mb-3 sm:mb-4 relative overflow-hidden group-hover:animate-bookglow">
                  <video className="w-full h-full object-cover" autoPlay loop muted playsInline poster={book.poster}>
                    <source src={book.video} type="video/mp4" />
                  </video>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Play className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 text-white/80 opacity-60 drop-shadow-lg group-hover:scale-110 group-hover:text-library-gold transition-all duration-300" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                  <Badge className="absolute top-1 right-1 sm:top-2 sm:right-2 bg-library-gold/90 text-library-mahogany text-xs sm:text-sm py-0.5 sm:py-1">{book.genre}</Badge>
                  <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 flex items-center space-x-1">
                    <Volume2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white/80" />
                    <span className="text-xs text-white/80">Audio</span>
                  </div>
                </div>

                <CardTitle className="text-lg sm:text-xl md:text-lg font-bold text-foreground group-hover:text-library-gold transition-colors line-clamp-2 mb-1">
                  {book.title}
                </CardTitle>
                <p className="text-library-gold font-medium text-sm sm:text-base md:text-sm">{book.author}</p>
              </CardHeader>

              <CardContent className="flex flex-col flex-1 p-2 sm:p-3 md:p-6 !pt-2">
                <p className="text-muted-foreground text-sm sm:text-base md:text-sm leading-relaxed line-clamp-3 sm:line-clamp-none mb-3 sm:mb-4">{book.description}</p>

                <div className="mt-4 sm:mt-auto space-y-6 md:space-y-4">
                  <div className="flex flex-wrap gap-1">
                    {book.features.slice(0, 2).map((feature, index) => (
                      <Badge key={index} variant="outline" className="text-xs sm:text-sm md:text-xs border-library-walnut text-muted-foreground py-0.5 sm:py-1">
                        {feature}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-xs sm:text-sm gap-2 sm:gap-2">
                    <div className="flex items-center space-x-1">
                      <Star className="h-3 w-3 sm:h-4 sm:w-4 text-library-gold fill-current" />
                      <span className="text-foreground font-medium">{book.rating}</span>
                    </div>
                    <div className="flex items-center space-x-1 text-muted-foreground">
                      <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="text-sm">{book.readTime}</span>
                    </div>
                    <span className="text-muted-foreground text-sm ">{book.year}</span>
                  </div>

                  <Button
                    className="w-full bg-library-walnut group-hover:bg-library-gold group-hover:text-library-mahogany transition-all duration-300 group/btn text-xs sm:text-sm py-2 sm:py-3"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBookClick(book);
                    }}
                  >
                    <Play className="hidden sm:block sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 group-hover:scale-110 transition-transform" />
                    <span className="truncate">{humanizeBookCardButtonText(book)}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedBooks;
