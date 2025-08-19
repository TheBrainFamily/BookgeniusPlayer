import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/library-hero.jpg";
import { Play, BookOpen } from "lucide-react";

interface SelectedBook {
  title: string;
  author: string;
  slug: string;
}

interface StartHereShowcaseProps {
  onBookSelect?: (book: SelectedBook) => void;
}

const StartHereShowcase = ({ onBookSelect }: StartHereShowcaseProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0); // 0 -> full, 1 -> collapsed

  // Heights from 100vh to 33vh
  const headerHeightVh = useMemo(() => 100 - progress * 67, [progress]);

  useEffect(() => {
    let sectionTop = 0;
    let viewport = window.innerHeight;
    let ticking = false;
    const minFraction = 0.33;

    const computeTotalCollapse = () => viewport * (1 - minFraction);

    const updateMetrics = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      sectionTop = rect.top + window.scrollY;
      viewport = window.innerHeight;
      onScroll();
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const totalCollapse = computeTotalCollapse();
        const scrolled = Math.min(Math.max(window.scrollY - sectionTop, 0), totalCollapse);
        const p = totalCollapse > 0 ? scrolled / totalCollapse : 0;
        setProgress(p);
        ticking = false;
      });
    };

    updateMetrics();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateMetrics);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateMetrics);
    };
  }, []);

  const selectBook = (book: SelectedBook) => {
    onBookSelect?.(book);
  };

  return (
    <section aria-labelledby="start-here-heading" className="relative" ref={containerRef}>
      {/* Sticky shrinking header */}
      <div className="sticky top-0 z-30 w-full overflow-hidden shadow-md pointer-events-none" style={{ height: `${headerHeightVh}vh`, willChange: "height" }}>
        <div className="relative h-full">
          {/* Background with elegant overlays to match theme */}
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroImage})` }} aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/95" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/60" aria-hidden />

          <div className="relative h-full container mx-auto px-4 flex flex-col items-center justify-center text-center">
            <h2 id="start-here-heading" className="text-3xl md:text-5xl font-bold text-foreground leading-tight">
              Experience Literature
              <span className="block text-transparent bg-gradient-to-r from-library-gold via-library-gold-glow to-library-gold bg-clip-text animate-candleflicker">
                Like Never Before
              </span>
            </h2>
            <p className="mt-4 max-w-3xl text-base md:text-lg text-muted-foreground">
              Start your journey with two hand-picked masterpieces. Choose the theatrical experience or dive into the classic novel.
            </p>
          </div>
        </div>
      </div>

      {/* Showcase grid under the sticky header */}
      <div className="relative z-10 container mx-auto px-4 py-10 md:py-16">
        <div className="mb-6 md:mb-10">
          <p className="uppercase tracking-wider text-xs text-muted-foreground">Start here</p>
          <h3 className="text-2xl md:text-3xl font-semibold text-foreground">Curated classics</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* 1984 */}
          <article className="group relative overflow-hidden rounded-xl border bg-card/60 backdrop-blur-sm border-library-walnut hover:border-library-gold transition-all duration-300">
            <div className="aspect-video w-full overflow-hidden">
              <img
                src="/1984-english.webp"
                alt="1984 by George Orwell poster"
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="p-5 md:p-6">
              <h4 className="text-xl font-bold text-foreground">1984</h4>
              <p className="text-sm text-muted-foreground mb-4">George Orwell • Dystopian classic</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="bg-library-gold text-library-mahogany hover:bg-library-gold-glow"
                  onClick={() => selectBook({ title: "1984", author: "George Orwell", slug: "1984-English" })}
                >
                  <Play className="mr-2 h-4 w-4" /> Theater experience
                </Button>
                <Button
                  variant="outline"
                  className="border-library-gold text-library-gold hover:bg-library-gold/10"
                  onClick={() => document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" })}
                >
                  <BookOpen className="mr-2 h-4 w-4" /> Read the novel
                </Button>
              </div>
            </div>
          </article>

          {/* Othello */}
          <article className="group relative overflow-hidden rounded-xl border bg-card/60 backdrop-blur-sm border-library-walnut hover:border-library-gold transition-all duration-300">
            <div className="aspect-video w-full overflow-hidden">
              <img
                src="/othello.webp"
                alt="Othello by William Shakespeare poster"
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="p-5 md:p-6">
              <h4 className="text-xl font-bold text-foreground">Othello</h4>
              <p className="text-sm text-muted-foreground mb-4">William Shakespeare • Tragedy</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="bg-library-gold text-library-mahogany hover:bg-library-gold-glow"
                  onClick={() => selectBook({ title: "Othello", author: "William Shakespeare", slug: "Othello" })}
                >
                  <Play className="mr-2 h-4 w-4" /> Theater experience
                </Button>
                <Button
                  variant="outline"
                  className="border-library-gold text-library-gold hover:bg-library-gold/10"
                  onClick={() => document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" })}
                >
                  <BookOpen className="mr-2 h-4 w-4" /> Read the novel
                </Button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};

export default StartHereShowcase;
