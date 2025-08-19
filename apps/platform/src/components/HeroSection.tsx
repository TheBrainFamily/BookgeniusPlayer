import { Button } from "@platform/components/ui/button";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import heroImage from "@platform/assets/library-hero-2.webp";

// for the backgroundImage this color works great, but only once the overlay is loaded backgroundColor: "#8d4214"
const HeroSection = () => {
  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroImage})` }}>
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/95" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/60" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <div className="max-w-4xl mx-auto">
          {/* Floating sparkles animation */}
          <div className="absolute -top-8 left-1/4 animate-float">
            <Sparkles className="h-6 w-6 text-library-gold opacity-60" />
          </div>
          <div className="absolute -top-4 right-1/3 animate-float" style={{ animationDelay: "2s" }}>
            <Sparkles className="h-4 w-4 text-library-gold opacity-40" />
          </div>
          <div className="absolute top-8 left-3/4 animate-float" style={{ animationDelay: "4s" }}>
            <Sparkles className="h-5 w-5 text-library-gold opacity-50" />
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-foreground leading-tight">
            Experience Literature
            <span className="block text-transparent bg-gradient-to-r from-library-gold via-library-gold-glow to-library-gold bg-clip-text animate-candleflicker">
              Like Never Before
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed font-light">
            Immerse yourself in fully-produced visual novels with stunning animations, character voices, and atmospheric soundtracks. Each story becomes a living, breathing
            experience that brings classic literature to vibrant life.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              className="bg-library-gold hover:bg-library-gold-glow text-library-mahogany font-semibold px-8 py-3 text-lg group transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-library-gold/25"
            >
              Start Reading
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="border-library-gold text-library-gold hover:bg-library-gold/10 hover:border-library-gold-glow px-8 py-3 text-lg group transition-all duration-300"
            >
              <BookOpen className="mr-2 h-5 w-5 group-hover:rotate-12 transition-transform" />
              View Collection
            </Button>
          </div>

          {/* Atmospheric stats */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-2xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-library-gold mb-2">12</div>
              <div className="text-muted-foreground">Visual Novels</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-library-gold mb-2">100%</div>
              <div className="text-muted-foreground">Immersive</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-library-gold mb-2">HD</div>
              <div className="text-muted-foreground">Productions</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
