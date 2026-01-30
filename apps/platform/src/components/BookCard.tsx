import { Play, Volume2, Star, Clock, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@platform/components/ui/card";
import { Button } from "@platform/components/ui/button";
import { Badge } from "@platform/components/ui/badge";
import { type books } from "@platform/books";
import { humanizeBookCardButtonText } from "@platform/utils/humanizeBookCardButtonText";
import { detectLanguageFromDomain } from "@platform/utils/languageDetection.ts";
import { LanguageFlagEN } from "@platform/components/LanguageFlagEN.tsx";
import { LanguageFlagPL } from "@platform/components/LanguageFlagPL.tsx";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { minutesToHours } from "@platform/utils/minutesToHours.ts";
import { type TFunction } from "i18next";

type Book = (typeof books)[number];

/** Rectangle in viewport coordinates */
type CardRect = { x: number; y: number; width: number; height: number };

/** Data passed on card click for the transition */
type CardClickData = {
  rect: CardRect;
  /** Captured video frame as data URL for instant display during transition */
  capturedFrame: string | null;
};

type BookCardProps = {
  book: Book;
  onClick: (book: Book, clickData: CardClickData) => void;
  variant?: "default" | "featured";
  showLanguageFlag?: boolean;
  className?: string;
};

/** Capture current video frame to a data URL */
const captureVideoFrame = (video: HTMLVideoElement): string | null => {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    // Cross-origin or other errors
    return null;
  }
};

const displayReadTime = (t: TFunction, readTime: { h: number; m: number }) => {
  if (readTime.h > 0) {
    return `${readTime.h} ${t("common.hours")} ${readTime.m > 0 ? `${readTime.m} ${t("common.minutes")}` : ""}`;
  }
  return `${readTime.m} ${t("common.minutes")}`;
};

/** Get element's bounding rect in viewport coordinates */
const getElementRect = (el: Element): CardRect => {
  const rect = el.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};

export default function BookCard({
  book,
  onClick,
  variant = "default",
  showLanguageFlag = false,
  className = "",
}: BookCardProps) {
  const { t } = useTranslation();
  const language = useMemo(() => detectLanguageFromDomain(), []);

  const readTime = minutesToHours(book.readTime);

  const isFeatured = variant === "featured";

  const cardBase =
    "relative bg-card/50 backdrop-blur-sm border-library-walnut transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-library-gold/10 hover:border-library-gold group cursor-pointer flex flex-col h-full";

  const mediaHeights = isFeatured ? "h-40 sm:h-40 md:h-48 lg:h-54" : "h-32 sm:h-40 md:h-48";
  const descriptionClamp = isFeatured ? "sm:line-clamp-none flex-grow" : "line-clamp-3 mb-4";
  const playIconClasses = isFeatured
    ? "hidden sm:block sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 group-hover:scale-110 transition-transform"
    : "mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 group-hover:scale-110 transition-transform";

  return (
    <Card
      className={`${cardBase} ${className}`}
      onClick={(e) => {
        // Get the video container rect (not the whole card)
        const videoContainer = e.currentTarget.querySelector("[data-video-container]");
        const videoElement = e.currentTarget.querySelector("video");
        const rect = videoContainer
          ? getElementRect(videoContainer)
          : getElementRect(e.currentTarget);
        const capturedFrame = videoElement ? captureVideoFrame(videoElement) : null;
        onClick(book, { rect, capturedFrame });
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${book.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          const videoContainer = e.currentTarget.querySelector("[data-video-container]");
          const videoElement = e.currentTarget.querySelector("video");
          const rect = videoContainer
            ? getElementRect(videoContainer)
            : getElementRect(e.currentTarget);
          const capturedFrame = videoElement ? captureVideoFrame(videoElement) : null;
          onClick(book, { rect, capturedFrame });
        }
      }}
    >
      {isFeatured && (
        <>
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-library-gold/20 via-transparent to-library-gold/20 animate-pulse" />
          </div>
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
            <div className="absolute top-4 right-4 animate-pulse">
              <Sparkles className="h-4 w-4 text-library-gold/60" />
            </div>
            <div
              className="absolute bottom-6 left-6 animate-pulse"
              style={{ animationDelay: "1s" }}
            >
              <Sparkles className="h-3 w-3 text-library-gold/40" />
            </div>
          </div>
        </>
      )}

      <CardHeader className="pb-3 sm:pb-4 p-2 sm:p-4 md:p-6">
        <div
          data-video-container
          className={`w-full ${mediaHeights} rounded-lg mb-3 sm:mb-4 relative overflow-hidden group-hover:animate-bookglow`}
        >
          <video
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            poster={book.poster}
            aria-hidden="true"
          >
            <source src={book.video} type="video/mp4" />
          </video>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Play className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 text-white/80 opacity-60 drop-shadow-lg group-hover:scale-110 group-hover:text-library-gold transition-all duration-300" />
          </div>

          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

          <Badge className="absolute top-1 right-1 sm:top-2 sm:right-2 bg-library-gold/90 text-library-mahogany text-xs sm:text-sm py-0.5 sm:py-1">
            {book.metadata[language]?.genre}
          </Badge>

          <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 flex items-center space-x-1">
            <Volume2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white/80" />
            <span className="text-xs text-white/80">Audio</span>
          </div>

          {showLanguageFlag && language === "pl" && (
            <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2">
              {book.language === "en" && <LanguageFlagEN />}
              {book.language === "pl" && <LanguageFlagPL />}
            </div>
          )}
        </div>

        <CardTitle className="text-lg sm:text-xl md:text-lg font-bold text-foreground group-hover:text-library-gold transition-colors line-clamp-2">
          {book.title}
        </CardTitle>
        <p className="text-library-gold font-medium text-sm">{book.author}</p>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 p-2 sm:p-3 md:p-6 !pt-2">
        <p className={`text-muted-foreground text-sm leading-relaxed ${descriptionClamp} mb-4`}>
          {book.metadata[language]?.description}
        </p>

        <div className="mt-auto space-y-6 md:space-y-4">
          <div className="flex flex-wrap gap-1">
            {book.metadata[language]?.features.slice(0, 2).map((feature, index) => (
              <Badge
                key={index}
                variant="outline"
                className="text-xs sm:text-sm md:text-xs border-library-walnut text-muted-foreground py-0.5 sm:py-1"
              >
                {feature}
              </Badge>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between text-xs sm:text-sm gap-2">
            <div className="flex items-center space-x-1">
              <Star className="h-3 w-3 sm:h-4 sm:w-4 text-library-gold fill-current" />
              <span className="text-foreground font-medium">{book.rating}</span>
            </div>
            <div className="flex items-center space-x-1 text-muted-foreground">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-sm">{displayReadTime(t, readTime)}</span>
            </div>
            <span className="text-muted-foreground text-sm">{book.year}</span>
          </div>

          <Button
            className="w-full bg-library-walnut group-hover:bg-library-gold group-hover:text-library-mahogany transition-all duration-300 group/btn text-xs sm:text-sm py-2 sm:py-3"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              // Find the video container for the expansion origin
              const card = e.currentTarget.closest("[role='button']");
              const videoContainer = card?.querySelector("[data-video-container]");
              const videoElement = card?.querySelector("video");
              const rect = videoContainer
                ? getElementRect(videoContainer)
                : card
                  ? getElementRect(card)
                  : getElementRect(e.currentTarget);
              const capturedFrame = videoElement ? captureVideoFrame(videoElement) : null;
              onClick(book, { rect, capturedFrame });
            }}
          >
            <Play className={playIconClasses} />
            <span className="truncate">{humanizeBookCardButtonText(book)}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
