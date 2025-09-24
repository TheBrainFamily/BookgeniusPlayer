import { Button } from "@wukong/components/ui/button";
import { Play, BookOpen } from "lucide-react";
import heroImage from "@wukong/assets/wukong-hero.jpg";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden cloud-pattern">
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url(${heroImage})` }} />
      <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" />

      <div className="relative z-10 container mx-auto px-4 text-center animate-fade-in">
        <div className="max-w-4xl mx-auto space-y-8">
          <h1 className="text-5xl md:text-7xl font-traditional font-bold text-foreground leading-tight">
            Experience the Legend of
            <span
              className="block text-accent font-extrabold drop-shadow-[0_0_20px_rgba(255,215,0,0.8)] animate-pulse"
              style={{ animationDuration: "4s", transform: "scale(1)", animation: "scalePulse 4s ease-in-out infinite" }}
            >
              The Monkey King
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Immerse yourself in the legendary Journey to the West, with stunning visuals and atmospheric soundtracks that bring Sun Wukong's epic tale to vibrant life.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
            <Button variant="golden" size="lg" className="text-lg px-8 py-4 h-auto">
              <Play className="h-6 w-6 mr-2" />
              <span
                onClick={() => {
                  const episodesSection = document.getElementById("featured-episodes");
                  if (episodesSection) {
                    episodesSection.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                style={{ cursor: "pointer", display: "inline-block", width: "100%" }}
              >
                Start Reading
              </span>
            </Button>
            {/* <Button variant="mystical" size="lg" className="text-lg px-8 py-4 h-auto">
              <BookOpen className="h-6 w-6 mr-2" />
              View Episodes
            </Button> */}
          </div>
        </div>
      </div>

      {/* Floating decorative elements */}
      <div className="absolute top-20 right-20 w-4 h-4 bg-accent/30 rounded-full animate-float" />
      <div className="absolute bottom-32 left-20 w-6 h-6 bg-accent/20 rounded-full animate-float" style={{ animationDelay: "2s" }} />
      <div className="absolute top-1/2 right-32 w-3 h-3 bg-accent/40 rounded-full animate-float" style={{ animationDelay: "4s" }} />
    </section>
  );
};

export default Hero;
