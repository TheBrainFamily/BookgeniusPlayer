import { Card, CardContent, CardHeader, CardTitle } from "@platform/components/ui/card";
import { Button } from "@platform/components/ui/button";
import { Crown, Heart, Sword, Skull, Compass, Scroll, ArrowRight } from "lucide-react";

const genres = [
  {
    id: 1,
    name: "Classic Literature",
    icon: Crown,
    description: "Timeless works that have shaped the literary world",
    bookCount: "2,500+",
    color: "text-library-gold",
    bgGradient: "from-library-gold/20 to-library-gold/5",
  },
  {
    id: 2,
    name: "Romance",
    icon: Heart,
    description: "Stories of love, passion, and human connection",
    bookCount: "1,800+",
    color: "text-library-burgundy",
    bgGradient: "from-library-burgundy/20 to-library-burgundy/5",
  },
  {
    id: 3,
    name: "Adventure",
    icon: Sword,
    description: "Epic tales of heroism and daring expeditions",
    bookCount: "1,200+",
    color: "text-library-green",
    bgGradient: "from-library-green/20 to-library-green/5",
  },
  {
    id: 4,
    name: "Gothic",
    icon: Skull,
    description: "Dark, mysterious tales of the supernatural",
    bookCount: "800+",
    color: "text-muted-foreground",
    bgGradient: "from-library-mahogany/20 to-library-mahogany/5",
  },
  {
    id: 5,
    name: "Travel & Exploration",
    icon: Compass,
    description: "Journeys to distant lands and unknown realms",
    bookCount: "600+",
    color: "text-library-gold",
    bgGradient: "from-library-walnut/20 to-library-walnut/5",
  },
  {
    id: 6,
    name: "Historical",
    icon: Scroll,
    description: "Chronicles of bygone eras and ancient civilizations",
    bookCount: "1,000+",
    color: "text-library-burgundy",
    bgGradient: "from-library-parchment/10 to-transparent",
  },
];

const GenreExploration = () => {
  return (
    <section className="py-16 px-4 bg-gradient-bookshelf">
      <div className="container mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Explore Literary <span className="text-library-gold">Genres</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Navigate through our carefully curated collections, each offering a unique window into different realms of human experience.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {genres.map((genre) => {
            const IconComponent = genre.icon;
            return (
              <Card
                key={genre.id}
                className="bg-card/40 backdrop-blur-sm border-library-walnut hover:border-library-gold transition-all duration-300 hover:scale-105 group cursor-pointer"
              >
                <CardHeader className="text-center">
                  <div
                    className={`mx-auto w-16 h-16 rounded-full bg-gradient-to-br ${genre.bgGradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <IconComponent className={`h-8 w-8 ${genre.color}`} />
                  </div>
                  <CardTitle className="text-xl font-bold text-foreground group-hover:text-library-gold transition-colors">{genre.name}</CardTitle>
                </CardHeader>

                <CardContent className="text-center space-y-4">
                  <p className="text-muted-foreground text-sm leading-relaxed">{genre.description}</p>

                  <div className="text-library-gold font-semibold">{genre.bookCount} books</div>

                  <Button variant="ghost" className="w-full text-foreground hover:text-library-gold hover:bg-library-walnut/50 group/btn">
                    Explore Collection
                    <ArrowRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-12">
          <Button size="lg" className="bg-library-gold hover:bg-library-gold-glow text-library-mahogany font-semibold px-8 py-3">
            View All Genres
          </Button>
        </div>
      </div>
    </section>
  );
};

export default GenreExploration;
