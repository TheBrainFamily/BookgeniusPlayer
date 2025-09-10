import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { BookOpen, Home, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@platform/components/ui/button";
import library404Image from "@platform/assets/library-404.png";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center overflow-hidden">
      {/* Background image with overlay */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${library404Image})` }}></div>

      {/* Floating sparkles animation */}
      <div className="absolute top-20 left-1/4 animate-float opacity-30">
        <Sparkles className="h-8 w-8 text-library-gold" />
      </div>
      <div className="absolute top-32 right-1/3 animate-float opacity-20" style={{ animationDelay: "2s" }}>
        <Sparkles className="h-6 w-6 text-library-gold" />
      </div>
      <div className="absolute bottom-32 left-3/4 animate-float opacity-25" style={{ animationDelay: "4s" }}>
        <Sparkles className="h-7 w-7 text-library-gold" />
      </div>
      <div className="absolute top-1/2 left-12 animate-float opacity-15" style={{ animationDelay: "1s" }}>
        <Sparkles className="h-5 w-5 text-library-gold" />
      </div>

      <div className="relative z-10 container mx-auto px-4 text-center">
        <div className="max-w-2xl mx-auto">
          {/* Animated book icon */}
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <BookOpen className="h-24 w-24 text-library-gold animate-candleflicker drop-shadow-lg" />
              <div className="absolute inset-0 h-24 w-24 text-library-gold opacity-50 animate-bookglow blur-sm" />
            </div>
          </div>

          {/* Error code with literary flair */}
          <div className="mb-6">
            <h1 className="text-8xl md:text-9xl font-bold text-library-gold leading-none animate-candleflicker">404</h1>
            <div className="h-1 w-32 bg-library-gold mx-auto mt-4 rounded-full opacity-80" />
          </div>

          {/* Literary-themed error message */}
          <div className="mb-8 space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">{t("notFound.title")}</h2>
            <p className="text-xl text-muted-foreground font-light leading-relaxed">{t("notFound.description")}</p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              asChild
              size="lg"
              className="bg-library-gold hover:bg-library-gold-glow text-library-mahogany font-semibold px-8 py-3 text-lg group transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-library-gold/25"
            >
              <a href="/">
                <Home className="mr-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                {t("notFound.returnHome")}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
