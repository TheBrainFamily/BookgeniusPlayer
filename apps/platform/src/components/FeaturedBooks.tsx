import { Card, CardContent, CardHeader, CardTitle } from "@platform/components/ui/card";
import { Button } from "@platform/components/ui/button";
import { Badge } from "@platform/components/ui/badge";
import { Star, BookOpen, Clock } from "lucide-react";

const featuredBooks = [
  {
    id: 1,
    title: "Pride and Prejudice",
    author: "Jane Austen",
    genre: "Romance",
    year: "1813",
    rating: 4.9,
    description: "A timeless tale of love, class, and social expectations in Georgian England.",
    cover: "bg-gradient-to-br from-library-burgundy via-library-burgundy/80 to-library-mahogany",
    readTime: "8 hrs",
  },
  {
    id: 2,
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    genre: "Classic",
    year: "1925",
    rating: 4.7,
    description: "The decadence and excess of the Jazz Age through the eyes of Nick Carraway.",
    cover: "bg-gradient-to-br from-library-green via-library-green/80 to-library-mahogany",
    readTime: "5 hrs",
  },
  {
    id: 3,
    title: "Wuthering Heights",
    author: "Emily Brontë",
    genre: "Gothic",
    year: "1847",
    rating: 4.8,
    description: "A passionate and tumultuous tale of love and revenge on the Yorkshire moors.",
    cover: "bg-gradient-to-br from-library-mahogany via-library-walnut to-library-burgundy",
    readTime: "9 hrs",
  },
];

const FeaturedBooks = () => {
  return (
    <section className="py-16 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Featured <span className="text-library-gold">Classics</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover timeless masterpieces that have shaped literature and continue to captivate readers across generations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuredBooks.map((book) => (
            <Card
              key={book.id}
              className="bg-card/50 backdrop-blur-sm border-library-walnut hover:border-library-gold transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-library-gold/10 group"
            >
              <CardHeader className="pb-4">
                {/* Book Cover */}
                <div className={`w-full h-48 rounded-lg ${book.cover} mb-4 flex items-center justify-center relative overflow-hidden group-hover:animate-bookglow`}>
                  <BookOpen className="h-12 w-12 text-library-parchment opacity-30" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <Badge className="absolute top-2 right-2 bg-library-gold/90 text-library-mahogany">{book.genre}</Badge>
                </div>

                <CardTitle className="text-xl font-bold text-foreground group-hover:text-library-gold transition-colors">{book.title}</CardTitle>
                <p className="text-library-gold font-medium">{book.author}</p>
              </CardHeader>

              <CardContent className="space-y-4">
                <p className="text-muted-foreground text-sm leading-relaxed">{book.description}</p>

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

                <Button className="w-full bg-library-walnut hover:bg-library-gold hover:text-library-mahogany transition-all duration-300" variant="secondary">
                  Add to Library
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <Button size="lg" variant="outline" className="border-library-gold text-library-gold hover:bg-library-gold/10 hover:border-library-gold-glow px-8 py-3">
            Explore All Books
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FeaturedBooks;
