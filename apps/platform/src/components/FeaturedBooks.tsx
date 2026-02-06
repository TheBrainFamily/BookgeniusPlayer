import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useRouteTransition } from "@platform/providers/RouteTransitionProvider";
import { SPLASH_FADE_DURATION_MS } from "../../../player/src/components/SplashScreen";
import type { books } from "@platform/books";
import BookCard from "./BookCard";
import { getBooksByCurrentLanguage } from "@platform/utils/bookLanguageFilter.ts";
import { detectLanguageFromDomain } from "@platform/utils/languageDetection.ts";

const ProductionsCarousel = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { startTransition, setNavigatedFromPlatform } = useRouteTransition();
  const language = useMemo(() => detectLanguageFromDomain(), []);
  const allProductionBooks = useMemo(() => getBooksByCurrentLanguage(), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollButtons();
    window.addEventListener("resize", updateScrollButtons);
    return () => window.removeEventListener("resize", updateScrollButtons);
  }, [allProductionBooks.length, updateScrollButtons]);

  useEffect(
    () => () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    },
    [],
  );

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateScrollButtons();
    });
  }, [updateScrollButtons]);

  const scrollByAmount = useCallback((direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const offset = Math.max(scrollRef.current.clientWidth * 0.75, 320);
    scrollRef.current.scrollBy({
      left: direction === "left" ? -offset : offset,
      behavior: "smooth",
    });
  }, []);

  const handleBookClick = (
    book: (typeof books)[0],
    clickData: {
      rect: { x: number; y: number; width: number; height: number };
      capturedFrame: string | null;
    },
  ) => {
    const title = book.title ?? "BookGenius";
    const phrases = book.metadata?.[language]?.phrases ?? [];
    const author = book.author;

    setNavigatedFromPlatform(true);
    startTransition({
      title,
      phrases,
      author,
      showStartButton: false,
      onStartClick: undefined,
      cardRect: clickData.rect,
      video: book.video,
      capturedFrame: clickData.capturedFrame,
    });

    setTimeout(() => {
      navigate(`/reader?book=${book.slug}`, { state: { meta: { title, phrases, author } } });
    }, SPLASH_FADE_DURATION_MS);
  };

  return (
    <section className="py-16" id="productions">
      <div className="px-8 md:px-12 lg:px-20 mb-10">
        <div className="flex items-center gap-3 mb-3">
          <Sparkles className="w-7 h-7 text-library-gold" />
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            {t("productions.immersive", "Immersive")}{" "}
            <span className="text-library-gold">
              {t("productions.productionsWord", "Productions")}
            </span>
          </h2>
        </div>
        <p className="text-lg text-muted-foreground max-w-2xl">
          {t(
            "productions.description",
            "Select titles featuring animated scenes, character voices, and atmospheric soundtracks.",
          )}
        </p>
      </div>

      <div className="relative group/carousel">
        {canScrollLeft && (
          <button
            type="button"
            aria-label={t("common.previous", "Previous")}
            onClick={() => scrollByAmount("left")}
            className="hidden md:flex pointer-events-none group-hover/carousel:pointer-events-auto absolute left-0 top-0 bottom-0 z-[90] w-16 items-center justify-center bg-gradient-to-r from-black/80 via-black/45 to-transparent text-white opacity-0 transition-opacity duration-200 group-hover/carousel:opacity-100 hover:from-black/90 hover:via-black/55"
          >
            <ChevronLeft className="h-10 w-10" />
          </button>
        )}

        {canScrollRight && (
          <button
            type="button"
            aria-label={t("common.next", "Next")}
            onClick={() => scrollByAmount("right")}
            className="hidden md:flex pointer-events-none group-hover/carousel:pointer-events-auto absolute right-0 top-0 bottom-0 z-[90] w-16 items-center justify-center bg-gradient-to-l from-black/80 via-black/45 to-transparent text-white opacity-0 transition-opacity duration-200 group-hover/carousel:opacity-100 hover:from-black/90 hover:via-black/55"
          >
            <ChevronRight className="h-10 w-10" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto pt-4 pb-8 pl-8 md:pl-12 lg:pl-20 gap-4 hide-scrollbar"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {allProductionBooks.map((book) => (
            <div key={book.id} className="flex-shrink-0 w-[280px] sm:w-[320px]">
              <BookCard book={book} variant="default" showLanguageFlag onClick={handleBookClick} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductionsCarousel;
