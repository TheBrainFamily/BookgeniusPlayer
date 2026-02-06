import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import heroImage from "@platform/assets/library-hero-2.webp";
import { Button } from "./ui/button";

const HeroSection = () => {
  const { t } = useTranslation();

  return (
    <section className="relative min-h-[calc(100vh-128px)] md:min-h-[calc(100vh-72px)] flex items-center justify-center overflow-hidden">
      {/* Background Image with Overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/95" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/60" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center py-10">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-foreground leading-tight">
            {t("hero.title", "Read Classic Literature")}
            <span
              className="
      block bg-clip-text text-transparent animate-candleflicker
      [background-color:var(--color-library-gold,hsl(45_70%_55%))]
      bg-gradient-to-r
      from-[var(--color-library-gold,hsl(45_70%_55%))]
      via-[var(--color-library-gold-glow,hsl(45_60%_65%))]
      to-[var(--color-library-gold,hsl(45_70%_55%))]
    "
            >
              {t("hero.subtitle", "Smarter")}
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed font-light">
            {t(
              "hero.description",
              "Never lose track of a character again. Ask questions without spoilers. Pick up right where you left off. Over 1,000 classic books — plus select titles with immersive animations and soundtracks.",
            )}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              asChild
              size="lg"
              className="bg-library-gold hover:bg-library-gold-glow text-library-mahogany font-semibold px-8 py-3 text-lg group transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-library-gold/25"
            >
              <a href="#library">
                {t("hero.startReading", "Explore Library")}
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-library-gold text-library-gold hover:bg-library-gold/10 hover:border-library-gold-glow px-8 py-3 text-lg group transition-all duration-300"
            >
              <a href="#productions">
                <Sparkles className="mr-2 h-5 w-5 group-hover:rotate-12 transition-transform" />
                {t("hero.viewCollection", "See Productions")}
              </a>
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-2xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-library-gold mb-2">1,000+</div>
              <div className="text-muted-foreground">{t("stats.booksCount", "Books")}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-library-gold mb-2">
                <BookOpen className="inline w-8 h-8" />
              </div>
              <div className="text-muted-foreground">
                {t("stats.characterTracking", "Character Tracking")}
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-library-gold mb-2">Q&A</div>
              <div className="text-muted-foreground">
                {t("stats.spoilerFreeQA", "Spoiler-Free")}
              </div>
            </div>
          </div>

          {/* Floating sparkles animation */}
          <div className="absolute -top-8 left-1/4 animate-float -z-10">
            <Sparkles className="h-6 w-6 text-library-gold opacity-60" />
          </div>
          <div
            className="absolute -top-4 right-1/3 animate-float -z-10"
            style={{ animationDelay: "2s" }}
          >
            <Sparkles className="h-4 w-4 text-library-gold opacity-40" />
          </div>
          <div
            className="absolute top-8 left-3/4 animate-float -z-10"
            style={{ animationDelay: "4s" }}
          >
            <Sparkles className="h-5 w-5 text-library-gold opacity-50" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
